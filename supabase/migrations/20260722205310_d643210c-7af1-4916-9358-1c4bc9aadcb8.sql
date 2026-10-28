-- R5 fechamento corretivo: uniformizar vocabulário de status em get_my_fund_status
-- Antes: retornava 'paid' e 'surplus'
-- Agora: retorna 'in_full' e 'overpaid' (padrão único de todas as RPCs)

CREATE OR REPLACE FUNCTION public.get_my_fund_status(p_token text)
RETURNS TABLE(
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
SET search_path = pg_catalog, public
AS $function$
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
    status := 'to_define';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(pay.amount), 0)::numeric(10,2) INTO v_paid
  FROM public.fund_payments pay
  WHERE pay.fund_id = v_fund.id AND pay.participant_id = v_part.id;

  fund_id := v_fund.id;
  participant_id := v_part.id;
  linked := true;
  participates := v_part.participates;
  exempt := v_part.exempt;
  agreed_amount := v_part.agreed_amount;
  total_paid := v_paid;
  outstanding := GREATEST(0, COALESCE(v_part.agreed_amount, 0) - v_paid);
  surplus := GREATEST(0, v_paid - COALESCE(v_part.agreed_amount, 0));

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
    status := 'in_full';
  ELSE
    status := 'overpaid';
  END IF;

  RETURN NEXT;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_my_fund_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_fund_status(text) TO anon, authenticated;