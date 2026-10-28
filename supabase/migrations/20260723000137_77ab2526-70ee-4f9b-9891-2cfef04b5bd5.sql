
-- Corrigir janela de prioridade para rodadas já existentes e abertura manual.

-- 1) Ao abrir manualmente (scheduled -> open), redefinir opens_at para agora.
--    E se priority_minutes ainda estiver nulo (rodada antiga), copiar do app_settings.
CREATE OR REPLACE FUNCTION public.admin_set_event_status(
  p_event_id uuid, p_status public.event_status, p_manual_override boolean, p_admin_user_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_old_status public.event_status;
  v_default_priority int;
BEGIN
  SELECT status INTO v_old_status FROM public.volleyball_events WHERE id = p_event_id;

  SELECT priority_minutes INTO v_default_priority
  FROM public.app_settings ORDER BY created_at ASC LIMIT 1;

  UPDATE public.volleyball_events
     SET status = p_status,
         manual_override = p_manual_override,
         opens_at = CASE
           WHEN p_status = 'open' AND v_old_status = 'scheduled'
             THEN now()
           ELSE opens_at
         END,
         priority_minutes = COALESCE(priority_minutes, v_default_priority)
   WHERE id = p_event_id;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id, 'admin_set_event_status', 'event', p_event_id,
          jsonb_build_object('status', p_status, 'manual_override', p_manual_override));
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_event_status(uuid, public.event_status, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_event_status(uuid, public.event_status, boolean, uuid) TO service_role;

-- 2) Fallback no join: se snapshot priority_minutes for NULL, usar app_settings.
CREATE OR REPLACE FUNCTION public.internal_join_event(
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
  v_priority_minutes int;
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

  -- Prioridade: snapshot do evento com fallback para app_settings.
  v_priority_minutes := v_event.priority_minutes;
  IF v_priority_minutes IS NULL THEN
    SELECT priority_minutes INTO v_priority_minutes
    FROM public.app_settings ORDER BY created_at ASC LIMIT 1;
  END IF;

  IF v_event.opens_at IS NOT NULL
     AND COALESCE(v_priority_minutes, 0) > 0
     AND NOT p_force_override
  THEN
    v_priority_end := v_event.opens_at + make_interval(mins => v_priority_minutes);
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

-- 3) get_public_current_event: também retornar priority_minutes com fallback.
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
         e.location, e.start_time, e.end_time, e.main_limit,
         COALESCE(e.priority_minutes, s.priority_minutes) AS priority_minutes
  FROM public.volleyball_events e
  LEFT JOIN LATERAL (
    SELECT priority_minutes FROM public.app_settings ORDER BY created_at ASC LIMIT 1
  ) s ON true
  WHERE e.status IN ('scheduled','open','closed')
    AND e.event_date >= (now() AT TIME ZONE COALESCE(e.timezone,'America/Sao_Paulo'))::date
  ORDER BY e.event_date ASC
  LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.get_public_current_event() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_current_event() TO anon, authenticated, service_role;

-- 4) Backfill do evento atual: como o admin já abriu manualmente,
--    aplicar priority_minutes do app_settings e mover opens_at para agora,
--    para que a janela de prioridade valha a partir da abertura real.
UPDATE public.volleyball_events e
   SET priority_minutes = COALESCE(e.priority_minutes,
                                   (SELECT priority_minutes FROM public.app_settings ORDER BY created_at ASC LIMIT 1)),
       opens_at = CASE
         WHEN e.status = 'open' AND e.opens_at > now() THEN now()
         ELSE e.opens_at
       END
 WHERE e.status = 'open';
