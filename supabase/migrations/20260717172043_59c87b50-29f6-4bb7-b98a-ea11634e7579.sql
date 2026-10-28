
-- ============================================================
-- LOTE A — Regras e Snapshot de Retirada/Penalidades
-- Aditivo puro. Sem remoção, renomeação, backfill ou RLS change.
-- ============================================================

-- 1) app_settings: 5 colunas NOT NULL com defaults sensatos.
--    Defaults preenchem a linha existente automaticamente.
ALTER TABLE public.app_settings
  ADD COLUMN withdrawal_deadline_weekday integer NOT NULL DEFAULT 2,
  ADD COLUMN withdrawal_deadline_time    time   NOT NULL DEFAULT '10:00'::time,
  ADD COLUMN penalty_late_leave          integer NOT NULL DEFAULT 2,
  ADD COLUMN penalty_no_show             integer NOT NULL DEFAULT 2,
  ADD COLUMN show_rules_to_players       boolean NOT NULL DEFAULT true;

ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_withdrawal_deadline_weekday_check
    CHECK (withdrawal_deadline_weekday BETWEEN 0 AND 6),
  ADD CONSTRAINT app_settings_penalty_late_leave_check
    CHECK (penalty_late_leave >= 0),
  ADD CONSTRAINT app_settings_penalty_no_show_check
    CHECK (penalty_no_show >= 0);

-- 2) volleyball_events: 5 colunas NULLABLE (sem default).
--    Rodadas existentes ficam NULL. Nenhum backfill.
ALTER TABLE public.volleyball_events
  ADD COLUMN withdrawal_deadline_weekday integer NULL,
  ADD COLUMN withdrawal_deadline_time    time    NULL,
  ADD COLUMN penalty_late_leave          integer NULL,
  ADD COLUMN penalty_no_show             integer NULL,
  ADD COLUMN show_rules_to_players       boolean NULL;

ALTER TABLE public.volleyball_events
  ADD CONSTRAINT volleyball_events_withdrawal_deadline_weekday_check
    CHECK (withdrawal_deadline_weekday IS NULL OR (withdrawal_deadline_weekday BETWEEN 0 AND 6)),
  ADD CONSTRAINT volleyball_events_penalty_late_leave_check
    CHECK (penalty_late_leave IS NULL OR penalty_late_leave >= 0),
  ADD CONSTRAINT volleyball_events_penalty_no_show_check
    CHECK (penalty_no_show IS NULL OR penalty_no_show >= 0);

-- 3) admin_create_next_event_v2(): estender apenas o INSERT para
--    incluir os 5 campos snapshot lidos de app_settings.
--    Mantém: cálculo de data, opens_at, status, location, start/end,
--    main_limit, timezone, manual_override e log em admin_actions_log.
CREATE OR REPLACE FUNCTION public.admin_create_next_event_v2()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_admin uuid := auth.uid();
  v_calc jsonb;
  v_next_date date;
  v_opens_at timestamptz;
  v_start time; v_end time; v_loc text; v_limit int; v_tz text;
  v_new_id uuid;
  v_wd_weekday int;
  v_wd_time    time;
  v_pen_late   int;
  v_pen_noshow int;
  v_show_rules boolean;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RETURN jsonb_build_object('status','unauthorized');
  END IF;

  v_calc := public.internal_compute_next_round();
  IF v_calc->>'status' = 'invalid_settings' THEN
    RETURN v_calc;
  END IF;
  IF v_calc->>'status' = 'blocked_by_existing_next_event' THEN
    RETURN v_calc;
  END IF;

  v_next_date := (v_calc->'computed'->>'event_date')::date;
  v_opens_at  := (v_calc->'computed'->>'opens_at')::timestamptz;
  v_start := (v_calc->'computed'->>'start_time')::time;
  v_end   := (v_calc->'computed'->>'end_time')::time;
  v_loc   := v_calc->'computed'->>'location';
  v_limit := (v_calc->'computed'->>'main_limit')::int;
  v_tz    := v_calc->'computed'->>'timezone';

  -- Snapshot das regras vigentes em app_settings no momento da criação.
  SELECT withdrawal_deadline_weekday, withdrawal_deadline_time,
         penalty_late_leave, penalty_no_show, show_rules_to_players
    INTO v_wd_weekday, v_wd_time, v_pen_late, v_pen_noshow, v_show_rules
  FROM public.app_settings
  ORDER BY created_at ASC
  LIMIT 1;

  BEGIN
    INSERT INTO public.volleyball_events
      (event_date, opens_at, status, location, start_time, end_time, main_limit, timezone, manual_override,
       withdrawal_deadline_weekday, withdrawal_deadline_time,
       penalty_late_leave, penalty_no_show, show_rules_to_players)
    VALUES
      (v_next_date, v_opens_at, 'scheduled', v_loc, v_start, v_end, v_limit, v_tz, false,
       v_wd_weekday, v_wd_time, v_pen_late, v_pen_noshow, v_show_rules)
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status','already_exists','event_date', v_next_date);
  END;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_admin, 'admin_create_next_event_v2', 'event', v_new_id,
          jsonb_build_object('event_date', v_next_date, 'opens_at', v_opens_at));

  RETURN jsonb_build_object(
    'status','created',
    'event', jsonb_build_object(
      'id', v_new_id,
      'event_date', v_next_date,
      'opens_at', v_opens_at,
      'start_time', v_start,
      'end_time', v_end,
      'location', v_loc,
      'main_limit', v_limit,
      'status','scheduled'
    )
  );
END;
$function$;
