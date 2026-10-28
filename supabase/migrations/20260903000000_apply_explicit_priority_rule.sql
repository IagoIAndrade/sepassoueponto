-- Update internal_join_event to remove financial dependency and use has_priority flag
CREATE OR REPLACE FUNCTION public.internal_join_event(p_event_id uuid, p_target_player_id uuid, p_responsible_player_id uuid, p_force_override boolean DEFAULT false)
 RETURNS TABLE(out_registration_id uuid, out_list_type list_type, out_position_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event public.volleyball_events;
  v_target public.players;
  v_resp_cnt int; v_main_cnt int; v_pos int;
  v_list public.list_type; v_reg_id uuid;
  v_blocked boolean; v_priority_end timestamptz;
  v_has_priority boolean; v_is_organizer boolean; v_priority_minutes int;
  v_event_name text;
BEGIN
  PERFORM public.lock_event(p_event_id);
  
  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF v_event.status <> 'open' THEN RAISE EXCEPTION 'event_not_open'; END IF;

  IF v_event.opens_at IS NULL OR v_event.opens_at > now() THEN
    UPDATE public.volleyball_events SET opens_at = now() WHERE id = p_event_id;
    SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  END IF;

  SELECT * INTO v_target FROM public.players WHERE id = p_target_player_id;
  IF v_target.id IS NULL OR NOT v_target.active THEN RAISE EXCEPTION 'player_not_available'; END IF;

  -- BLOQUEIO DE REENTRADA: Mesma rodada após late_leave
  IF EXISTS (
      SELECT 1 FROM public.player_incidents 
      WHERE player_id = p_target_player_id 
        AND event_id = p_event_id 
        AND incident_type = 'late_leave' 
        AND status NOT IN ('cancelled', 'justified', 'RESOLVED', 'PERDOADA')
  ) AND NOT p_force_override THEN
      RAISE EXCEPTION 'late_leave_rejoin_forbidden';
  END IF;

  -- Bloqueio disciplinar completo
  PERFORM public.internal_validate_disciplinary_status(p_target_player_id, v_event.group_id, p_event_id, p_force_override);

  IF EXISTS (SELECT 1 FROM public.registrations r
             WHERE r.event_id = p_event_id AND r.player_id = p_target_player_id AND r.cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'already_registered';
  END IF;

  v_priority_minutes := v_event.priority_minutes;
  IF v_priority_minutes IS NULL THEN
    SELECT priority_minutes INTO v_priority_minutes FROM public.app_settings WHERE group_id = v_event.group_id;
  END IF;
  v_priority_minutes := COALESCE(v_priority_minutes, 0);
  
  v_priority_end := v_event.opens_at + (v_priority_minutes * interval '1 minute');

  -- Nova verificação de prioridade (explícita ou organizador)
  SELECT has_priority, is_organizer INTO v_has_priority, v_is_organizer FROM public.player_groups WHERE player_id = p_target_player_id AND group_id = v_event.group_id;
  v_has_priority := COALESCE(v_has_priority, false);
  v_is_organizer := COALESCE(v_is_organizer, false);

  IF now() < v_priority_end AND NOT v_has_priority AND NOT v_is_organizer AND NOT p_force_override THEN
    RAISE EXCEPTION 'priority_window_active';
  END IF;

  SELECT count(*)::int INTO v_main_cnt FROM public.registrations
  WHERE event_id = p_event_id AND list_type = 'main' AND cancelled_at IS NULL;

  IF v_main_cnt < v_event.main_limit THEN
    v_list := 'main';
  ELSE
    v_list := 'wait';
  END IF;

  SELECT COALESCE(max(position_number), 0) + 1 INTO v_pos
  FROM public.registrations
  WHERE event_id = p_event_id AND list_type = v_list AND cancelled_at IS NULL;

  INSERT INTO public.registrations (
    event_id, player_id, list_type, position_number, registered_by_player_id
  ) VALUES (
    p_event_id, p_target_player_id, v_list, v_pos, p_responsible_player_id
  ) RETURNING id INTO v_reg_id;

  SELECT g.name INTO v_event_name FROM public.groups g WHERE g.id = v_event.group_id;
  
  IF v_list = 'main' THEN
    INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
    VALUES (
      p_target_player_id, 'registration_confirmed', v_event.group_id, p_event_id, 
      jsonb_build_object('message', 'Você entrou na Lista Principal de ' || v_event_name || '.'),
      'reg-conf-' || p_target_player_id || '-' || p_event_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  ELSE
    INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
    VALUES (
      p_target_player_id, 'waitlist_joined', v_event.group_id, p_event_id, 
      jsonb_build_object('message', 'No momento você está em ' || v_pos || 'º lugar na fila de espera de ' || v_event_name || '.'),
      'reg-wait-' || p_target_player_id || '-' || p_event_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_reg_id, v_list, v_pos;
END;
$function$;
