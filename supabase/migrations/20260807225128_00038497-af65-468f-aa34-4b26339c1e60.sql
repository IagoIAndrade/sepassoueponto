CREATE OR REPLACE FUNCTION public.admin_save_teams(p_event_id uuid, p_assignments jsonb, p_admin_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF jsonb_array_length(v_regs) > 10 THEN RAISE EXCEPTION 'team_too_large'; END IF;
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
END; $function$;