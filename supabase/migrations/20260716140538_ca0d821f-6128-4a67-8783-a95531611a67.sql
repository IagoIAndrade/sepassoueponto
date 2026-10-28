
DROP FUNCTION IF EXISTS public.internal_join_event(uuid,uuid,uuid,boolean);
DROP FUNCTION IF EXISTS public.admin_add_player(uuid,uuid,public.list_type,uuid,boolean);

CREATE FUNCTION public.internal_join_event(
  p_event_id uuid, p_target_player_id uuid, p_responsible_player_id uuid, p_force_override boolean DEFAULT false
) RETURNS TABLE(out_registration_id uuid, out_list_type public.list_type, out_position_number int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_event public.volleyball_events; v_target public.players;
        v_resp_cnt int; v_main_cnt int; v_pos int; v_list public.list_type; v_reg_id uuid; v_blocked boolean;
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

CREATE FUNCTION public.admin_add_player(
  p_event_id uuid, p_target_player_id uuid, p_list_type public.list_type,
  p_admin_user_id uuid, p_force_override boolean DEFAULT false
) RETURNS TABLE(out_registration_id uuid, out_list_type public.list_type, out_position_number int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_event public.volleyball_events; v_pos int; v_reg uuid; v_blocked boolean; v_main_cnt int;
BEGIN
  PERFORM public.lock_event(p_event_id);
  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_target_player_id AND active) THEN
    RAISE EXCEPTION 'player_not_available'; END IF;
  IF EXISTS (SELECT 1 FROM public.registrations r
             WHERE r.event_id = p_event_id AND r.player_id = p_target_player_id AND r.cancelled_at IS NULL)
  THEN RAISE EXCEPTION 'already_registered'; END IF;
  v_blocked := public.internal_is_blocked(p_target_player_id, v_event.event_date);
  IF v_blocked AND NOT p_force_override THEN RAISE EXCEPTION 'player_blocked'; END IF;
  IF p_list_type = 'main' THEN
    SELECT count(*) INTO v_main_cnt FROM public.registrations r
     WHERE r.event_id = p_event_id AND r.list_type = 'main' AND r.cancelled_at IS NULL;
    IF v_main_cnt >= v_event.main_limit THEN RAISE EXCEPTION 'main_full'; END IF;
    v_pos := v_main_cnt + 1;
  ELSE
    SELECT coalesce(max(r.position_number),0)+1 INTO v_pos FROM public.registrations r
     WHERE r.event_id = p_event_id AND r.list_type = 'wait' AND r.cancelled_at IS NULL;
  END IF;
  INSERT INTO public.registrations (event_id, player_id, registered_by_player_id, list_type, position_number)
  VALUES (p_event_id, p_target_player_id, p_target_player_id, p_list_type, v_pos)
  RETURNING id INTO v_reg;
  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id,'admin_add_player','registration', v_reg,
          jsonb_build_object('event_id', p_event_id, 'player_id', p_target_player_id,
                             'list_type', p_list_type, 'force', p_force_override));
  out_registration_id := v_reg; out_list_type := p_list_type; out_position_number := v_pos; RETURN NEXT;
END; $$;

REVOKE ALL ON FUNCTION public.internal_join_event(uuid,uuid,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_join_event(uuid,uuid,uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.admin_add_player(uuid,uuid,public.list_type,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_player(uuid,uuid,public.list_type,uuid,boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_save_teams(
  p_event_id uuid, p_assignments jsonb, p_admin_user_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_item jsonb; v_team int; v_regs jsonb; v_reg_id uuid; v_team_id uuid;
        v_reg_arr uuid[]; v_all_seen uuid[] := ARRAY[]::uuid[];
BEGIN
  PERFORM public.lock_event(p_event_id);
  IF NOT EXISTS (SELECT 1 FROM public.volleyball_events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'event_not_found'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_assignments,'[]'::jsonb)) LOOP
    v_team := (v_item->>'team_number')::int;
    IF v_team NOT IN (1,2,3) THEN RAISE EXCEPTION 'invalid_team_number'; END IF;
    v_regs := coalesce(v_item->'registration_ids','[]'::jsonb);
    IF jsonb_typeof(v_regs) <> 'array' THEN RAISE EXCEPTION 'invalid_team_payload'; END IF;
    IF jsonb_array_length(v_regs) > 6 THEN RAISE EXCEPTION 'team_too_large'; END IF;
    SELECT array_agg((value)::uuid) INTO v_reg_arr FROM jsonb_array_elements_text(v_regs);
    IF v_reg_arr IS NULL THEN v_reg_arr := ARRAY[]::uuid[]; END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(v_reg_arr) x(id)
      WHERE NOT EXISTS (
        SELECT 1 FROM public.registrations r
         WHERE r.id = x.id AND r.event_id = p_event_id
           AND r.list_type = 'main' AND r.cancelled_at IS NULL
      )
    ) THEN RAISE EXCEPTION 'invalid_registration_for_team'; END IF;
    v_all_seen := v_all_seen || v_reg_arr;
  END LOOP;
  IF (SELECT count(*) FROM unnest(v_all_seen)) <> (SELECT count(DISTINCT x) FROM unnest(v_all_seen) x) THEN
    RAISE EXCEPTION 'player_in_multiple_teams';
  END IF;
  DELETE FROM public.team_members WHERE team_id IN (SELECT id FROM public.teams WHERE event_id = p_event_id);
  DELETE FROM public.teams WHERE event_id = p_event_id;
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_assignments,'[]'::jsonb)) LOOP
    v_team := (v_item->>'team_number')::int;
    INSERT INTO public.teams (event_id, team_number) VALUES (p_event_id, v_team) RETURNING id INTO v_team_id;
    FOR v_reg_id IN SELECT (value)::uuid FROM jsonb_array_elements_text(coalesce(v_item->'registration_ids','[]'::jsonb)) LOOP
      INSERT INTO public.team_members (team_id, registration_id) VALUES (v_team_id, v_reg_id);
    END LOOP;
  END LOOP;
  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id,'admin_save_teams','event', p_event_id, p_assignments);
END; $$;
REVOKE ALL ON FUNCTION public.admin_save_teams(uuid,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_teams(uuid,jsonb,uuid) TO service_role;
