
-- ============================================================
-- Lote R2 — Configuração administrativa do rateio
-- ============================================================

-- 1) Leitura da configuração atual + histórico de rateios encerrados.
CREATE OR REPLACE FUNCTION public.admin_get_fund_config()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_active jsonb;
  v_history jsonb;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.to_jsonb(f.*) INTO v_active
    FROM public.equipment_funds f
   WHERE f.is_active = true
   LIMIT 1;

  SELECT pg_catalog.coalesce(
           pg_catalog.jsonb_agg(pg_catalog.to_jsonb(f.*) ORDER BY f.updated_at DESC),
           '[]'::jsonb)
    INTO v_history
    FROM public.equipment_funds f
   WHERE f.is_active = false;

  RETURN pg_catalog.jsonb_build_object('active', v_active, 'history', v_history);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_get_fund_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_fund_config() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_fund_config() TO authenticated;

-- 2) Upsert seguro: um único rateio ativo por vez.
CREATE OR REPLACE FUNCTION public.admin_upsert_fund_config(
  p_title        text,
  p_total_amount numeric,
  p_due_date     date,
  p_notes        text,
  p_is_active    boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid       uuid := auth.uid();
  v_active_id uuid;
  v_prev      public.equipment_funds%ROWTYPE;
  v_new_id    uuid;
  v_title     text;
  v_amount    numeric(10,2);
  v_notes     text;
  v_action    text;
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  v_title := pg_catalog.btrim(pg_catalog.coalesce(p_title, ''));
  IF pg_catalog.length(v_title) < 2 THEN
    RAISE EXCEPTION 'invalid_title' USING ERRCODE = '22023';
  END IF;

  IF p_total_amount IS NULL OR p_total_amount < 0 THEN
    RAISE EXCEPTION 'invalid_amount' USING ERRCODE = '22023';
  END IF;
  v_amount := pg_catalog.round(p_total_amount::numeric, 2);

  v_notes := pg_catalog.nullif(pg_catalog.btrim(pg_catalog.coalesce(p_notes, '')), '');

  -- Lock atômico do rateio ativo (evita corrida).
  SELECT id INTO v_active_id
    FROM public.equipment_funds
   WHERE is_active = true
   FOR UPDATE;

  IF v_active_id IS NOT NULL THEN
    SELECT * INTO v_prev FROM public.equipment_funds WHERE id = v_active_id;

    UPDATE public.equipment_funds
       SET title        = v_title,
           total_amount = v_amount,
           due_date     = p_due_date,
           notes        = v_notes,
           is_active    = pg_catalog.coalesce(p_is_active, true),
           updated_at   = pg_catalog.now()
     WHERE id = v_active_id;

    v_action := CASE
      WHEN pg_catalog.coalesce(p_is_active, true) = false AND v_prev.is_active = true THEN 'fund_deactivated'
      ELSE 'fund_updated'
    END;

    INSERT INTO public.admin_actions_log(admin_user_id, action, target_type, target_id, details)
    VALUES (v_uid, v_action, 'equipment_fund', v_active_id,
      pg_catalog.jsonb_build_object(
        'before', pg_catalog.jsonb_build_object(
          'title', v_prev.title,
          'total_amount', v_prev.total_amount,
          'due_date', v_prev.due_date,
          'is_active', v_prev.is_active
        ),
        'after', pg_catalog.jsonb_build_object(
          'title', v_title,
          'total_amount', v_amount,
          'due_date', p_due_date,
          'is_active', pg_catalog.coalesce(p_is_active, true)
        )
      ));

    RETURN pg_catalog.jsonb_build_object('ok', true, 'fund_id', v_active_id, 'action', v_action);
  END IF;

  -- Sem rateio ativo: só cria quando p_is_active for verdadeiro.
  IF pg_catalog.coalesce(p_is_active, false) = false THEN
    RETURN pg_catalog.jsonb_build_object('ok', true, 'fund_id', NULL, 'action', 'noop');
  END IF;

  INSERT INTO public.equipment_funds(title, total_amount, due_date, notes, is_active, created_by)
  VALUES (v_title, v_amount, p_due_date, v_notes, true, v_uid)
  RETURNING id INTO v_new_id;

  INSERT INTO public.admin_actions_log(admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'fund_created', 'equipment_fund', v_new_id,
    pg_catalog.jsonb_build_object(
      'title', v_title,
      'total_amount', v_amount,
      'due_date', p_due_date,
      'is_active', true
    ));

  RETURN pg_catalog.jsonb_build_object('ok', true, 'fund_id', v_new_id, 'action', 'fund_created');
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_upsert_fund_config(text, numeric, date, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_upsert_fund_config(text, numeric, date, text, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_upsert_fund_config(text, numeric, date, text, boolean) TO authenticated;

-- 3) Painel de totais.
CREATE OR REPLACE FUNCTION public.admin_get_fund_dashboard(p_fund_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
DECLARE
  v_uid           uuid := auth.uid();
  v_fund          public.equipment_funds%ROWTYPE;
  v_collected     numeric(14,2) := 0;
  v_committed     numeric(14,2) := 0;
  v_participants  integer := 0;
  v_linked        integer := 0;
  v_without       integer := 0;
  v_remaining     numeric(14,2);
  v_excess        numeric(14,2);
  v_without_owner numeric(14,2);
  v_percent       numeric(6,2);
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  IF p_fund_id IS NULL THEN
    SELECT * INTO v_fund FROM public.equipment_funds WHERE is_active = true LIMIT 1;
  ELSE
    SELECT * INTO v_fund FROM public.equipment_funds WHERE id = p_fund_id;
  END IF;

  IF v_fund.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('fund', NULL);
  END IF;

  SELECT pg_catalog.coalesce(pg_catalog.sum(amount), 0)
    INTO v_collected
    FROM public.fund_payments
   WHERE fund_id = v_fund.id;

  SELECT pg_catalog.count(*) INTO v_participants
    FROM public.fund_participants
   WHERE fund_id = v_fund.id;

  SELECT pg_catalog.coalesce(pg_catalog.sum(agreed_amount), 0)
    INTO v_committed
    FROM public.fund_participants
   WHERE fund_id = v_fund.id
     AND participates = true
     AND exempt = false
     AND agreed_amount IS NOT NULL;

  SELECT pg_catalog.count(DISTINCT player_id) INTO v_linked
    FROM public.fund_participant_players
   WHERE fund_id = v_fund.id;

  SELECT pg_catalog.count(*) INTO v_without
    FROM public.fund_participants p
   WHERE p.fund_id = v_fund.id
     AND NOT EXISTS (
       SELECT 1 FROM public.fund_participant_players l
        WHERE l.fund_id = v_fund.id AND l.participant_id = p.id
     );

  v_remaining     := pg_catalog.greatest(v_fund.total_amount - v_collected, 0);
  v_excess        := pg_catalog.greatest(v_collected - v_fund.total_amount, 0);
  v_without_owner := pg_catalog.greatest(v_fund.total_amount - v_committed, 0);
  v_percent       := CASE
                       WHEN v_fund.total_amount > 0
                         THEN pg_catalog.round((v_collected / v_fund.total_amount) * 100, 2)
                       ELSE 0
                     END;

  RETURN pg_catalog.jsonb_build_object(
    'fund', pg_catalog.to_jsonb(v_fund),
    'totals', pg_catalog.jsonb_build_object(
      'total_amount',                      v_fund.total_amount,
      'collected',                         v_collected,
      'remaining',                         v_remaining,
      'percent',                           v_percent,
      'excess',                            v_excess,
      'committed',                         v_committed,
      'without_owner',                     v_without_owner,
      'participants_count',                v_participants,
      'linked_players_count',              v_linked,
      'participants_without_player_count', v_without
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_get_fund_dashboard(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_fund_dashboard(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_fund_dashboard(uuid) TO authenticated;
