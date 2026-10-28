CREATE OR REPLACE FUNCTION public.get_public_registrations(p_event_id uuid)
 RETURNS TABLE(player_id uuid, player_name text, player_avatar_path text, list_type list_type, position_number integer, created_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT p.id, p.name, p.avatar_path, r.list_type, r.position_number, r.created_at
  FROM public.registrations r
  JOIN public.players p ON p.id = r.player_id
  WHERE r.event_id = p_event_id AND r.cancelled_at IS NULL
  ORDER BY r.created_at ASC, r.id ASC;
$function$;

CREATE OR REPLACE FUNCTION public.admin_add_player(p_event_id uuid, p_target_player_id uuid, p_list_type list_type, p_admin_user_id uuid, p_force_override boolean DEFAULT false, p_registration_source text DEFAULT 'admin'::text)
 RETURNS TABLE(out_registration_id uuid, out_list_type list_type, out_position_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_event public.volleyball_events; 
    v_pos int; 
    v_reg uuid; 
    v_blocked boolean;
BEGIN
  PERFORM public.lock_event(p_event_id);
  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_target_player_id AND active) THEN
    RAISE EXCEPTION 'player_not_available'; END IF;
  IF EXISTS (SELECT 1 FROM public.registrations r
             WHERE r.event_id = p_event_id AND r.player_id = p_target_player_id AND r.cancelled_at IS NULL)
  THEN RAISE EXCEPTION 'already_registered'; END IF;
  v_blocked := public.internal_is_blocked(p_target_player_id, v_event.event_date, v_event.group_id);
  IF v_blocked AND NOT p_force_override THEN RAISE EXCEPTION 'player_blocked'; END IF;

  -- position_number agora é apenas um fallback sequencial, não controla a ordem visual principal
  SELECT coalesce(max(position_number), 0) + 1 INTO v_pos 
  FROM public.registrations WHERE event_id = p_event_id AND cancelled_at IS NULL;

  INSERT INTO public.registrations (event_id, player_id, registered_by_player_id, list_type, position_number, registration_source)
  VALUES (p_event_id, p_target_player_id, p_target_player_id, p_list_type, v_pos, p_registration_source)
  RETURNING id INTO v_reg;

  INSERT INTO public.player_groups (player_id, group_id, status) VALUES (p_target_player_id, v_event.group_id, 'approved')
  ON CONFLICT (player_id, group_id) DO UPDATE SET status = 'approved';

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id,'admin_add_player','registration', v_reg,
          jsonb_build_object('event_id', p_event_id,'player_id', p_target_player_id,
                             'list_type', p_list_type,'force', p_force_override,'group_id', v_event.group_id));
  out_registration_id := v_reg; out_list_type := p_list_type; out_position_number := v_pos; RETURN NEXT;
END; $function$;