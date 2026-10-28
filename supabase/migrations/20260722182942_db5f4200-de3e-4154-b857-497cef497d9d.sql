
-- ============================================================
-- LOTE R1 — Rateio dos equipamentos: modelagem + RLS + RPCs base
-- ============================================================

-- 1) equipment_funds
CREATE TABLE public.equipment_funds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(btrim(title)) >= 2),
  total_amount numeric(10,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  due_date date,
  notes text,
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- No máximo um rateio ativo por vez
CREATE UNIQUE INDEX equipment_funds_only_one_active
  ON public.equipment_funds ((is_active))
  WHERE is_active = true;

GRANT ALL ON public.equipment_funds TO service_role;
ALTER TABLE public.equipment_funds ENABLE ROW LEVEL SECURITY;
-- Sem policies para anon/authenticated: leitura pública passa por RPC SECURITY DEFINER.

CREATE TRIGGER equipment_funds_set_updated_at
  BEFORE UPDATE ON public.equipment_funds
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 2) fund_participants
CREATE TABLE public.fund_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.equipment_funds(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(btrim(name)) >= 2),
  phone text,
  agreed_amount numeric(10,2) CHECK (agreed_amount IS NULL OR agreed_amount >= 0),
  participates boolean NOT NULL DEFAULT true,
  exempt boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX fund_participants_fund_idx ON public.fund_participants(fund_id);
CREATE INDEX fund_participants_name_lower_idx ON public.fund_participants(fund_id, lower(name));

GRANT ALL ON public.fund_participants TO service_role;
ALTER TABLE public.fund_participants ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER fund_participants_set_updated_at
  BEFORE UPDATE ON public.fund_participants
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3) fund_participant_players (vínculo cadastro <-> participante financeiro, por rateio)
CREATE TABLE public.fund_participant_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.equipment_funds(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.fund_participants(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, player_id)
);
CREATE INDEX fund_participant_players_participant_idx
  ON public.fund_participant_players(participant_id);
CREATE INDEX fund_participant_players_player_idx
  ON public.fund_participant_players(player_id);

GRANT ALL ON public.fund_participant_players TO service_role;
ALTER TABLE public.fund_participant_players ENABLE ROW LEVEL SECURITY;

-- 4) fund_payments (participant_id opcional → contribuições avulsas)
CREATE TABLE public.fund_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.equipment_funds(id) ON DELETE RESTRICT,
  participant_id uuid REFERENCES public.fund_participants(id) ON DELETE SET NULL,
  payer_name text,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  paid_at date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  payment_method text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fund_payments_has_source
    CHECK (participant_id IS NOT NULL OR (payer_name IS NOT NULL AND length(btrim(payer_name)) >= 1))
);
CREATE INDEX fund_payments_fund_idx ON public.fund_payments(fund_id);
CREATE INDEX fund_payments_participant_idx ON public.fund_payments(participant_id);
CREATE INDEX fund_payments_paid_at_idx ON public.fund_payments(fund_id, paid_at);

GRANT ALL ON public.fund_payments TO service_role;
ALTER TABLE public.fund_payments ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER fund_payments_set_updated_at
  BEFORE UPDATE ON public.fund_payments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- RPCs públicas
-- ============================================================

-- Resumo público do rateio ativo (só totais globais)
CREATE OR REPLACE FUNCTION public.get_public_fund_summary()
RETURNS TABLE (
  fund_id uuid,
  title text,
  total_amount numeric,
  due_date date,
  notes text,
  total_collected numeric,
  remaining_balance numeric,
  surplus_amount numeric,
  percent_collected numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH f AS (
    SELECT id, title, total_amount, due_date, notes
    FROM public.equipment_funds
    WHERE is_active = true
    LIMIT 1
  ), agg AS (
    SELECT COALESCE(SUM(p.amount), 0)::numeric(10,2) AS total_collected
    FROM public.fund_payments p
    JOIN f ON f.id = p.fund_id
  )
  SELECT
    f.id,
    f.title,
    f.total_amount,
    f.due_date,
    f.notes,
    agg.total_collected,
    GREATEST(f.total_amount - agg.total_collected, 0)::numeric(10,2) AS remaining_balance,
    GREATEST(agg.total_collected - f.total_amount, 0)::numeric(10,2) AS surplus_amount,
    CASE
      WHEN f.total_amount = 0 THEN 0::numeric
      ELSE ROUND((agg.total_collected / f.total_amount) * 100, 2)
    END AS percent_collected
  FROM f, agg;
$$;

REVOKE ALL ON FUNCTION public.get_public_fund_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_fund_summary() TO anon, authenticated, service_role;

-- Status financeiro do jogador identificado pelo token de sessão
CREATE OR REPLACE FUNCTION public.get_my_fund_status(p_token text)
RETURNS TABLE (
  fund_id uuid,
  participant_id uuid,
  linked boolean,
  participates boolean,
  exempt boolean,
  agreed_amount numeric,
  total_paid numeric,
  outstanding numeric,
  surplus numeric,
  status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pid uuid;
  v_fund public.equipment_funds;
  v_part public.fund_participants;
  v_paid numeric(10,2) := 0;
BEGIN
  v_pid := public.internal_validate_session(p_token);
  IF v_pid IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_fund FROM public.equipment_funds WHERE is_active = true LIMIT 1;
  IF v_fund.id IS NULL THEN
    RETURN;
  END IF;

  SELECT fp.* INTO v_part
  FROM public.fund_participant_players fpp
  JOIN public.fund_participants fp ON fp.id = fpp.participant_id
  WHERE fpp.fund_id = v_fund.id AND fpp.player_id = v_pid
  LIMIT 1;

  IF v_part.id IS NULL THEN
    fund_id := v_fund.id;
    participant_id := NULL;
    linked := false;
    participates := false;
    exempt := false;
    agreed_amount := NULL;
    total_paid := 0;
    outstanding := 0;
    surplus := 0;
    status := 'unlinked';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0)::numeric(10,2) INTO v_paid
  FROM public.fund_payments
  WHERE fund_id = v_fund.id AND participant_id = v_part.id;

  fund_id := v_fund.id;
  participant_id := v_part.id;
  linked := true;
  participates := v_part.participates;
  exempt := v_part.exempt;
  agreed_amount := v_part.agreed_amount;
  total_paid := v_paid;
  outstanding := GREATEST(COALESCE(v_part.agreed_amount, 0) - v_paid, 0);
  surplus := GREATEST(v_paid - COALESCE(v_part.agreed_amount, 0), 0);

  IF NOT v_part.participates THEN
    status := 'not_participating';
  ELSIF v_part.exempt THEN
    status := 'exempt';
  ELSIF v_part.agreed_amount IS NULL THEN
    status := 'to_define';
  ELSIF v_paid = 0 THEN
    status := 'pending';
  ELSIF v_paid < v_part.agreed_amount THEN
    status := 'partial';
  ELSIF v_paid = v_part.agreed_amount THEN
    status := 'paid';
  ELSE
    status := 'surplus';
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_fund_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_fund_status(text) TO anon, authenticated, service_role;
