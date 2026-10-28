
-- ============================================================
-- Janela de prioridade de 30 min para jogadores em dia
-- Aditivo puro. Sem remoção nem renomeação.
-- ============================================================

-- 1) app_settings: coluna com default 30, 0 desativa.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS priority_minutes integer NOT NULL DEFAULT 30;

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_priority_minutes_check;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_priority_minutes_check
    CHECK (priority_minutes >= 0 AND priority_minutes <= 240);

-- 2) volleyball_events: snapshot NULLABLE.
ALTER TABLE public.volleyball_events
  ADD COLUMN IF NOT EXISTS priority_minutes integer NULL;

ALTER TABLE public.volleyball_events
  DROP CONSTRAINT IF EXISTS volleyball_events_priority_minutes_check;
ALTER TABLE public.volleyball_events
  ADD CONSTRAINT volleyball_events_priority_minutes_check
    CHECK (priority_minutes IS NULL OR (priority_minutes >= 0 AND priority_minutes <= 240));

-- 3) get_public_settings: expor priority_minutes.
DROP FUNCTION IF EXISTS public.get_public_settings();
CREATE FUNCTION public.get_public_settings()
 RETURNS TABLE(event_name text, location text, start_time time without time zone,
               end_time time without time zone, main_limit integer, timezone text,
               priority_minutes integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT event_name, location, start_time, end_time, main_limit, timezone, priority_minutes
  FROM public.app_settings ORDER BY created_at ASC LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_public_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated, service_role;

-- 4) get_public_current_event: expor priority_minutes do evento (snapshot).
DROP FUNCTION IF EXISTS public.get_public_current_event();
CREATE FUNCTION public.get_public_current_event()
 RETURNS TABLE(id uuid, event_date date, opens_at timestamptz, closes_at timestamptz,
               status public.event_status, location text,
               start_time time without time zone, end_time time without time zone,
               main_limit integer, priority_minutes integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT e.id, e.event_date, e.opens_at, e.closes_at, e.status,
         e.location, e.start_time, e.end_time, e.main_limit, e.priority_minutes
  FROM public.volleyball_events e
  WHERE e.status IN ('scheduled','open','closed')
    AND e.event_date >= (now() AT TIME ZONE COALESCE(e.timezone,'America/Sao_Paulo'))::date
  ORDER BY e.event_date ASC
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_public_current_event() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_current_event() TO anon, authenticated, service_role;

-- 5) admin_create_next_event_v2: incluir snapshot de priority_minutes.
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
  v_priority   int;
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

  SELECT withdrawal_deadline_weekday, withdrawal_deadline_time,
         penalty_late_leave, penalty_no_show, show_rules_to_players,
         priority_minutes
    INTO v_wd_weekday, v_wd_time, v_pen_late, v_pen_noshow, v_show_rules,
         v_priority
  FROM public.app_settings
  ORDER BY created_at ASC
  LIMIT 1;

  BEGIN
    INSERT INTO public.volleyball_events
      (event_date, opens_at, status, location, start_time, end_time, main_limit, timezone, manual_override,
       withdrawal_deadline_weekday, withdrawal_deadline_time,
       penalty_late_leave, penalty_no_show, show_rules_to_players,
       priority_minutes)
    VALUES
      (v_next_date, v_opens_at, 'scheduled', v_loc, v_start, v_end, v_limit, v_tz, false,
       v_wd_weekday, v_wd_time, v_pen_late, v_pen_noshow, v_show_rules,
       v_priority)
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status','already_exists','event_date', v_next_date);
  END;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_admin, 'admin_create_next_event_v2', 'event', v_new_id,
          jsonb_build_object('event_date', v_next_date, 'opens_at', v_opens_at,
                             'priority_minutes', v_priority));

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
      'priority_minutes', v_priority,
      'status','scheduled'
    )
  );
END;
$function$;

-- 6) Helper: jogador está "em dia" com o rateio ativo?
--    Em dia = in_full, overpaid, ou (to_define com pagamento > 0).
--    Se NÃO existir fundo ativo, retorna TRUE (janela de prioridade não faz
--    sentido sem rateio, então não bloqueia ninguém).
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

  SELECT COALESCE(SUM(amount), 0)::numeric(10,2) INTO v_paid
  FROM public.fund_payments
  WHERE fund_id = v_fund_id AND participant_id = v_part.id;

  IF v_part.agreed_amount IS NULL THEN
    RETURN v_paid > 0;
  END IF;

  RETURN v_paid >= v_part.agreed_amount;
END;
$function$;
REVOKE ALL ON FUNCTION public.internal_player_is_paid_up(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_player_is_paid_up(uuid) TO service_role;

-- 7) internal_join_event: aplicar janela de prioridade server-side.
DROP FUNCTION IF EXISTS public.internal_join_event(uuid, uuid, uuid, boolean);
CREATE FUNCTION public.internal_join_event(
  p_event_id uuid, p_target_player_id uuid, p_responsible_player_id uuid,
  p_force_override boolean DEFAULT false
) RETURNS TABLE(out_registration_id uuid, out_list_type public.list_type, out_position_number int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_event public.volleyball_events; v_target public.players;
  v_resp_cnt int; v_main_cnt int; v_pos int; v_list public.list_type;
  v_reg_id uuid; v_blocked boolean;
  v_priority_end timestamptz;
  v_remaining int;
  v_paid_up boolean;
BEGIN
  PERFORM public.lock_event(p_event_id);
  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF v_event.status <> 'open' THEN RAISE EXCEPTION 'event_not_open'; END IF;
  SELECT * INTO v_target FROM public.players WHERE id = p_target_player_id;
  IF v_target.id IS NULL OR NOT v_target.active THEN RAISE EXCEPTION 'player_not_available'; END IF;
  v_blocked := public.internal_is_blocked(p_target_player_id, v_event.event_date);
  IF v_blocked AND NOT p_force_override THEN RAISE EXCEPTION 'player_blocked'; END IF;
  IF EXISTS (SELECT 1 FROM public.registrations r
             WHERE r.event_id = p_event_id AND r.player_id = p_target_player_id AND r.cancelled_at IS NULL)
  THEN RAISE EXCEPTION 'already_registered'; END IF;

  -- Janela de prioridade: enquanto now() < opens_at + priority_minutes,
  -- somente jogadores em dia podem entrar (principal ou reserva).
  IF v_event.opens_at IS NOT NULL
     AND COALESCE(v_event.priority_minutes, 0) > 0
     AND NOT p_force_override
  THEN
    v_priority_end := v_event.opens_at + make_interval(mins => v_event.priority_minutes);
    IF now() < v_priority_end THEN
      v_paid_up := public.internal_player_is_paid_up(p_target_player_id);
      IF NOT v_paid_up THEN
        v_remaining := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_priority_end - now()))))::int;
        RAISE EXCEPTION 'priority_window_active:%', v_remaining;
      END IF;
    END IF;
  END IF;

  SELECT count(*) INTO v_resp_cnt FROM public.registrations r
   WHERE r.event_id = p_event_id AND r.registered_by_player_id = p_responsible_player_id AND r.cancelled_at IS NULL;
  IF v_resp_cnt >= 2 THEN RAISE EXCEPTION 'responsible_limit_reached'; END IF;
  SELECT count(*) INTO v_main_cnt FROM public.registrations r
   WHERE r.event_id = p_event_id AND r.list_type = 'main' AND r.cancelled_at IS NULL;
  IF v_main_cnt < v_event.main_limit THEN
    v_list := 'main'; v_pos := v_main_cnt + 1;
  ELSE
    v_list := 'wait';
    SELECT coalesce(max(r.position_number),0)+1 INTO v_pos FROM public.registrations r
     WHERE r.event_id = p_event_id AND r.list_type = 'wait' AND r.cancelled_at IS NULL;
  END IF;
  INSERT INTO public.registrations (event_id, player_id, registered_by_player_id, list_type, position_number)
  VALUES (p_event_id, p_target_player_id, p_responsible_player_id, v_list, v_pos)
  RETURNING id INTO v_reg_id;
  IF p_force_override AND v_blocked THEN
    INSERT INTO public.admin_actions_log (action, target_type, target_id, details)
    VALUES ('force_add_blocked','registration', v_reg_id,
      jsonb_build_object('player_id', p_target_player_id, 'event_id', p_event_id));
  END IF;
  out_registration_id := v_reg_id; out_list_type := v_list; out_position_number := v_pos; RETURN NEXT;
END; $$;
REVOKE ALL ON FUNCTION public.internal_join_event(uuid, uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_join_event(uuid, uuid, uuid, boolean) TO service_role;
