CREATE OR REPLACE FUNCTION public.admin_request_pin_reset(p_player_id uuid, p_admin_user_id uuid DEFAULT auth.uid())
 RETURNS TABLE(player_id uuid, revoked_sessions integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_revoked int := 0;
  v_admin_id uuid := COALESCE(p_admin_user_id, auth.uid());
BEGIN
  IF v_admin_id IS NULL OR NOT public.has_role(v_admin_id, 'admin') THEN 
    RAISE EXCEPTION 'not_authorized'; 
  END IF;
  
  UPDATE public.players 
  SET pin_hash = public.hash_pin('1234'), 
      must_change_pin = true, 
      updated_at = now() 
  WHERE id = p_player_id;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'player_not_found'; END IF;
  
  WITH d AS (DELETE FROM public.player_sessions ps WHERE ps.player_id = p_player_id RETURNING 1)
  SELECT count(*)::int INTO v_revoked FROM d;
  
  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_admin_id, 'admin_request_pin_reset', 'player', p_player_id, '{}'::jsonb);

  player_id := p_player_id;
  revoked_sessions := v_revoked;
  RETURN NEXT;
END;
$function$;
