CREATE OR REPLACE FUNCTION public.internal_join_event(
  p_event_id uuid,
  p_target_player_id uuid,
  p_responsible_player_id uuid,
  p_force_override boolean DEFAULT false
)
RETURNS TABLE(out_registration_id uuid, out_list_type list_type, out_position_number integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_event public.volleyball_events;
  v_target public.players;
  v_resp_cnt int;
  v_main_cnt int;
  v_pos int;
  v_list public.list_type;
  v_reg_id uuid;
  v_blocked boolean;
  v_priority_end timestamptz;
  v_remaining int;
  v_paid_up boolean;
  v_priority_minutes int;
BEGIN
  -- Lock the event for updates
  PERFORM public.lock_event(p_event_id);

  -- Get event details
  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF v_event.status <> 'open' THEN RAISE EXCEPTION 'event_not_open'; END IF;

  -- Ensure opens_at is set
  IF v_event.opens_at IS NULL OR v_event.opens_at > now() THEN
    UPDATE public.volleyball_events SET opens_at = now() WHERE id = p_event_id;
    SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  END IF;

  -- Get target player details
  SELECT * INTO v_target FROM public.players WHERE id = p_target_player_id;
  IF v_target.id IS NULL OR NOT v_target.active THEN RAISE EXCEPTION 'player_not_available'; END IF;

  -- Check if blocked
  v_blocked := public.internal_is_blocked(p_target_player_id, v_event.event_date);
  IF v_blocked AND NOT p_force_override THEN RAISE EXCEPTION 'player_blocked'; END IF;

  -- Check already registered
  IF EXISTS (SELECT 1 FROM public.registrations r 
             WHERE r.event_id = p_event_id AND r.player_id = p_target_player_id AND r.cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'already_registered';
  END IF;

  -- Calculate priority
  v_priority_minutes := v_event.priority_minutes;
  IF v_priority_minutes IS NULL THEN
    SELECT priority_minutes INTO v_priority_minutes FROM public.app_settings WHERE group_id = v_event.group_id;
  END IF;
  v_priority_minutes := COALESCE(v_priority_minutes, 0);
  v_priority_end := v_event.opens_at + (v_priority_minutes * interval '1 minute');

  -- Check if player is paid up
  v_paid_up := public.player_is_paid_up(p_target_player_id, v_event.group_id);

  -- Decide list type
  SELECT count(*)::int INTO v_main_cnt FROM public.registrations 
  WHERE event_id = p_event_id AND list_type = 'main' AND cancelled_at IS NULL;

  IF v_main_cnt < v_event.main_limit THEN
    IF now() > v_priority_end OR v_paid_up THEN
      v_list := 'main';
    ELSE
      v_list := 'wait';
    END IF;
  ELSE
    v_list := 'wait';
  END IF;

  -- Calculate position number
  SELECT COALESCE(max(position_number), 0) + 1 INTO v_pos 
  FROM public.registrations 
  WHERE event_id = p_event_id AND list_type = v_list AND cancelled_at IS NULL;

  -- Insert registration (CORRECTED COLUMN NAME: registered_by_player_id)
  INSERT INTO public.registrations (
    event_id, 
    player_id, 
    registered_by_player_id, 
    list_type, 
    position_number,
    registration_source
  ) VALUES (
    p_event_id, 
    p_target_player_id, 
    p_responsible_player_id, 
    v_list, 
    v_pos,
    'inscription'
  ) RETURNING id INTO v_reg_id;

  RETURN QUERY SELECT v_reg_id, v_list, v_pos;
END;
$$;
