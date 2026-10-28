
-- 1) Coluna nova
ALTER TABLE public.fund_participants
  ADD COLUMN IF NOT EXISTS payment_reported boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_reported_at timestamptz;

-- 2) is_paid_up: quem informou pagamento também conta como em dia (para prioridade)
CREATE OR REPLACE FUNCTION public.internal_player_is_paid_up(p_player_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_fund_id uuid;
  v_part public.fund_participants;
  v_paid numeric(10,2) := 0;
BEGIN
  SELECT id INTO v_fund_id FROM public.equipment_funds WHERE is_active = true LIMIT 1;
  IF v_fund_id IS NULL THEN
    RETURN true;
  END IF;

  SELECT fp.* INTO v_part
  FROM public.fund_participant_players fpp
  JOIN public.fund_participants fp ON fp.id = fpp.participant_id
  WHERE fpp.fund_id = v_fund_id AND fpp.player_id = p_player_id
  LIMIT 1;

  IF v_part.id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT v_part.participates OR v_part.exempt THEN
    RETURN false;
  END IF;

  -- Informou pagamento → tratado como em dia para efeito de prioridade
  IF COALESCE(v_part.payment_reported, false) THEN
    RETURN true;
  END IF;

  SELECT COALESCE(SUM(amount), 0)::numeric(10,2) INTO v_paid
  FROM public.fund_payments
  WHERE fund_id = v_fund_id AND participant_id = v_part.id;

  IF v_part.agreed_amount IS NULL THEN
    RETURN v_paid > 0;
  END IF;

  RETURN v_paid >= v_part.agreed_amount;
END;
$function$;

-- 3) internal_fund_participant_status: parâmetro opcional payment_reported
CREATE OR REPLACE FUNCTION public.internal_fund_participant_status(
  p_participates boolean,
  p_exempt boolean,
  p_agreed_amount numeric,
  p_paid numeric,
  p_payment_reported boolean DEFAULT false
)
RETURNS TABLE(paid numeric, balance numeric, credit numeric, status text)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_paid numeric := COALESCE(p_paid, 0);
  v_reported boolean := COALESCE(p_payment_reported, false);
BEGIN
  paid := v_paid;

  IF p_participates = false THEN
    balance := 0; credit := v_paid; status := 'not_participating'; RETURN NEXT; RETURN;
  END IF;

  IF p_exempt = true THEN
    balance := 0; credit := v_paid; status := 'exempt'; RETURN NEXT; RETURN;
  END IF;

  IF p_agreed_amount IS NULL THEN
    balance := 0; credit := v_paid;
    IF v_reported AND v_paid = 0 THEN
      status := 'payment_reported';
    ELSE
      status := 'to_define';
    END IF;
    RETURN NEXT; RETURN;
  END IF;

  balance := greatest(p_agreed_amount - v_paid, 0::numeric);
  credit  := greatest(v_paid - p_agreed_amount, 0::numeric);

  IF v_paid >= p_agreed_amount THEN
    IF v_paid = p_agreed_amount THEN
      status := 'in_full';
    ELSE
      status := 'overpaid';
    END IF;
  ELSIF v_reported THEN
    status := 'payment_reported';
  ELSIF v_paid = 0 THEN
    status := 'pending';
  ELSE
    status := 'partial';
  END IF;
  RETURN NEXT;
END;
$function$;

-- 4) get_public_fund_player_statuses: incluir payment_reported
CREATE OR REPLACE FUNCTION public.get_public_fund_player_statuses()
RETURNS TABLE(player_id uuid, status text, has_paid boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  WITH f AS (
    SELECT id FROM public.equipment_funds WHERE is_active = true LIMIT 1
  ),
  agg AS (
    SELECT
      fp.id AS participant_id,
      fp.participates,
      fp.exempt,
      fp.agreed_amount,
      COALESCE(fp.payment_reported, false) AS payment_reported,
      COALESCE((
        SELECT SUM(pay.amount)
        FROM public.fund_payments pay
        WHERE pay.fund_id = (SELECT id FROM f) AND pay.participant_id = fp.id
      ), 0)::numeric(10,2) AS paid
    FROM public.fund_participants fp
    WHERE fp.fund_id = (SELECT id FROM f)
  ),
  computed AS (
    SELECT
      participant_id,
      CASE
        WHEN NOT participates THEN 'not_participating'
        WHEN exempt THEN 'exempt'
        WHEN agreed_amount IS NULL AND payment_reported AND paid = 0 THEN 'payment_reported'
        WHEN agreed_amount IS NULL THEN 'to_define'
        WHEN paid >= agreed_amount AND paid = agreed_amount THEN 'in_full'
        WHEN paid >= agreed_amount THEN 'overpaid'
        WHEN payment_reported THEN 'payment_reported'
        WHEN paid = 0 THEN 'pending'
        ELSE 'partial'
      END AS status,
      (paid > 0 OR payment_reported) AS has_paid
    FROM agg
  )
  SELECT fpp.player_id, c.status, c.has_paid
  FROM public.fund_participant_players fpp
  JOIN computed c ON c.participant_id = fpp.participant_id
  WHERE fpp.fund_id = (SELECT id FROM f);
$function$;

-- 5) get_my_fund_status: refletir payment_reported
CREATE OR REPLACE FUNCTION public.get_my_fund_status(p_token text)
RETURNS TABLE(fund_id uuid, participant_id uuid, linked boolean, participates boolean, exempt boolean, agreed_amount numeric, total_paid numeric, outstanding numeric, surplus numeric, status text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
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
    IF COALESCE(v_part.payment_reported, false) AND v_paid = 0 THEN
      status := 'payment_reported';
    ELSE
      status := 'to_define';
    END IF;
  ELSIF v_paid >= v_part.agreed_amount THEN
    IF v_paid = v_part.agreed_amount THEN
      status := 'in_full';
    ELSE
      status := 'overpaid';
    END IF;
  ELSIF COALESCE(v_part.payment_reported, false) THEN
    status := 'payment_reported';
  ELSIF v_paid = 0 THEN
    status := 'pending';
  ELSE
    status := 'partial';
  END IF;

  RETURN NEXT;
END;
$function$;

-- 6) admin_get_fund_participant: retornar payment_reported e usar novo status
CREATE OR REPLACE FUNCTION public.admin_get_fund_participant(p_participant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_p public.fund_participants%ROWTYPE;
  v_paid numeric(10,2) := 0;
  v_players jsonb := '[]'::jsonb;
  v_status_row record;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_participant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_participant' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_p FROM public.fund_participants WHERE id = p_participant_id;
  IF v_p.id IS NULL THEN
    RAISE EXCEPTION 'participant_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(pg_catalog.sum(amount), 0)::numeric(10,2) INTO v_paid
  FROM public.fund_payments
  WHERE fund_id = v_p.fund_id AND participant_id = v_p.id;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'player_id', pl.id, 'name', pl.name, 'phone_normalized', pl.phone_normalized, 'active', pl.active
      ) ORDER BY pl.name
    ), '[]'::jsonb) INTO v_players
  FROM public.fund_participant_players fpp
  JOIN public.players pl ON pl.id = fpp.player_id
  WHERE fpp.fund_id = v_p.fund_id AND fpp.participant_id = v_p.id;

  SELECT * INTO v_status_row
    FROM public.internal_fund_participant_status(v_p.participates, v_p.exempt, v_p.agreed_amount, v_paid, v_p.payment_reported);

  RETURN pg_catalog.jsonb_build_object(
    'id', v_p.id, 'fund_id', v_p.fund_id, 'name', v_p.name, 'phone', v_p.phone,
    'participates', v_p.participates, 'exempt', v_p.exempt,
    'agreed_amount', v_p.agreed_amount, 'notes', v_p.notes,
    'payment_reported', COALESCE(v_p.payment_reported, false),
    'payment_reported_at', v_p.payment_reported_at,
    'total_paid', v_status_row.paid, 'balance', v_status_row.balance,
    'credit', v_status_row.credit, 'status', v_status_row.status,
    'players', v_players,
    'created_at', v_p.created_at, 'updated_at', v_p.updated_at
  );
END;
$function$;

-- 7) admin_list_fund_participants: incluir payment_reported + filtro
CREATE OR REPLACE FUNCTION public.admin_list_fund_participants(p_fund_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_status text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_fund_id uuid;
  v_search text;
  v_status text;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_fund_id := p_fund_id;
  IF v_fund_id IS NULL THEN
    SELECT id INTO v_fund_id FROM public.equipment_funds WHERE is_active = true LIMIT 1;
  END IF;
  IF v_fund_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('fund_id', NULL, 'items', '[]'::jsonb);
  END IF;

  v_search := NULLIF(pg_catalog.btrim(pg_catalog.lower(COALESCE(p_search, ''))), '');
  v_status := NULLIF(pg_catalog.btrim(COALESCE(p_status, '')), '');

  WITH paid_agg AS (
    SELECT participant_id, COALESCE(pg_catalog.sum(amount), 0)::numeric(10,2) AS total_paid
    FROM public.fund_payments
    WHERE fund_id = v_fund_id AND participant_id IS NOT NULL
    GROUP BY participant_id
  ),
  players_agg AS (
    SELECT fpp.participant_id,
           pg_catalog.count(DISTINCT fpp.player_id)::int AS players_count,
           COALESCE(
             pg_catalog.jsonb_agg(
               pg_catalog.jsonb_build_object(
                 'player_id', pl.id,
                 'name', pl.name,
                 'phone_normalized', pl.phone_normalized,
                 'active', pl.active
               ) ORDER BY pl.name
             ), '[]'::jsonb) AS players
    FROM public.fund_participant_players fpp
    JOIN public.players pl ON pl.id = fpp.player_id
    WHERE fpp.fund_id = v_fund_id
    GROUP BY fpp.participant_id
  ),
  base AS (
    SELECT p.*,
           COALESCE(pa.total_paid, 0)::numeric(10,2) AS total_paid,
           COALESCE(pla.players_count, 0) AS players_count,
           COALESCE(pla.players, '[]'::jsonb) AS players
    FROM public.fund_participants p
    LEFT JOIN paid_agg pa ON pa.participant_id = p.id
    LEFT JOIN players_agg pla ON pla.participant_id = p.id
    WHERE p.fund_id = v_fund_id
  ),
  scored AS (
    SELECT b.*, s.balance, s.credit, s.status
    FROM base b,
    LATERAL public.internal_fund_participant_status(b.participates, b.exempt, b.agreed_amount, b.total_paid, b.payment_reported) s
  ),
  filtered AS (
    SELECT * FROM scored s
    WHERE (v_search IS NULL
       OR pg_catalog.lower(s.name) LIKE '%' || v_search || '%'
       OR pg_catalog.lower(COALESCE(s.phone, '')) LIKE '%' || v_search || '%'
       OR EXISTS (
         SELECT 1 FROM pg_catalog.jsonb_array_elements(s.players) pl
         WHERE pg_catalog.lower(pl->>'name') LIKE '%' || v_search || '%'
       )
    )
    AND (v_status IS NULL OR (
       CASE v_status
         WHEN 'no_link' THEN s.players_count = 0
         WHEN 'one_link' THEN s.players_count = 1
         WHEN 'many_links' THEN s.players_count > 1
         WHEN 'not_participating' THEN s.status = 'not_participating'
         WHEN 'exempt' THEN s.status = 'exempt'
         WHEN 'to_define' THEN s.status = 'to_define'
         WHEN 'pending' THEN s.status = 'pending'
         WHEN 'partial' THEN s.status = 'partial'
         WHEN 'in_full' THEN s.status = 'in_full'
         WHEN 'overpaid' THEN s.status = 'overpaid'
         WHEN 'payment_reported' THEN s.status = 'payment_reported'
         ELSE true
       END
    ))
  )
  SELECT pg_catalog.jsonb_build_object(
    'fund_id', v_fund_id,
    'items', COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', f.id,
        'name', f.name,
        'phone', f.phone,
        'participates', f.participates,
        'exempt', f.exempt,
        'agreed_amount', f.agreed_amount,
        'notes', f.notes,
        'payment_reported', COALESCE(f.payment_reported, false),
        'payment_reported_at', f.payment_reported_at,
        'total_paid', f.total_paid,
        'balance', f.balance,
        'credit', f.credit,
        'status', f.status,
        'players_count', f.players_count,
        'players', f.players,
        'created_at', f.created_at,
        'updated_at', f.updated_at
      ) ORDER BY pg_catalog.lower(f.name)
    ), '[]'::jsonb)
  ) INTO v_result
  FROM filtered f;

  RETURN v_result;
END;
$function$;

-- 8) Nova RPC: alternar "Informou pagamento"
CREATE OR REPLACE FUNCTION public.admin_set_payment_reported(p_participant_id uuid, p_value boolean)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_prev public.fund_participants%ROWTYPE;
  v_new boolean := COALESCE(p_value, false);
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;
  IF p_participant_id IS NULL THEN
    RAISE EXCEPTION 'invalid_participant' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_prev FROM public.fund_participants WHERE id = p_participant_id FOR UPDATE;
  IF v_prev.id IS NULL THEN
    RAISE EXCEPTION 'participant_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.fund_participants
     SET payment_reported = v_new,
         payment_reported_at = CASE WHEN v_new THEN pg_catalog.now() ELSE NULL END,
         updated_by = v_uid,
         updated_at = pg_catalog.now()
   WHERE id = p_participant_id;

  INSERT INTO public.admin_actions_log(admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'fund_payment_reported_set', 'fund_participant', p_participant_id,
    pg_catalog.jsonb_build_object(
      'fund_id', v_prev.fund_id,
      'before', COALESCE(v_prev.payment_reported, false),
      'after', v_new
    ));

  RETURN pg_catalog.jsonb_build_object('ok', true, 'participant_id', p_participant_id, 'payment_reported', v_new);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.admin_set_payment_reported(uuid, boolean) TO authenticated;
