DROP FUNCTION IF EXISTS public.admin_request_pin_reset(uuid, uuid);
DROP FUNCTION IF EXISTS public.admin_request_pin_reset(uuid);

CREATE OR REPLACE FUNCTION public.admin_request_pin_reset(p_player_id uuid)
 RETURNS TABLE(player_id uuid, revoked_sessions integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_revoked int := 0;
  v_upd int := 0;
  v_admin_id uuid := auth.uid();
BEGIN
  IF v_admin_id IS NULL OR NOT public.has_role(v_admin_id, 'admin') THEN 
    RAISE EXCEPTION 'not_authorized'; 
  END IF;
  
  UPDATE public.players 
  SET pin_hash = extensions.crypt('1234', extensions.gen_salt('bf', 10)), 
      must_change_pin = true, 
      updated_at = now() 
  WHERE id = p_player_id;
  
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd = 0 THEN 
    RAISE EXCEPTION 'player_not_found'; 
  END IF;
  
  WITH d AS (DELETE FROM public.player_sessions ps WHERE ps.player_id = p_player_id RETURNING 1)
  SELECT count(*)::int INTO v_revoked FROM d;
  
  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_admin_id, 'admin_request_pin_reset', 'player', p_player_id, '{}'::jsonb);

  player_id := p_player_id;
  revoked_sessions := v_revoked;
  RETURN NEXT;
END;
$function$;

DROP FUNCTION IF EXISTS public.internal_login_player(text, text, inet, text);
DROP FUNCTION IF EXISTS public.internal_login_player(text, text, inet, text, boolean);

CREATE OR REPLACE FUNCTION public.internal_login_player(p_phone text, p_pin text, p_ip inet, p_user_agent text, p_remember boolean DEFAULT false)
 RETURNS TABLE(player_id uuid, session_id uuid, token_plain text, expires_at timestamp with time zone, absolute_expires_at timestamp with time zone, remember boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_phone text; v_p public.players; v_fail_phone int; v_fail_ip int;
  v_sess uuid; v_tok text; v_exp timestamptz; v_abs timestamptz; v_ttl int;
BEGIN
  v_phone := public.normalize_phone(p_phone);
  IF v_phone = '' OR p_pin IS NULL OR p_pin = '' THEN RAISE EXCEPTION 'invalid_credentials'; END IF;
  SELECT count(*) INTO v_fail_phone FROM public.player_login_attempts
   WHERE phone_normalized = v_phone AND success = false AND attempted_at > now() - interval '15 minutes';
  IF v_fail_phone >= 5 THEN RAISE EXCEPTION 'rate_limited_phone'; END IF;
  IF p_ip IS NOT NULL THEN
    SELECT count(*) INTO v_fail_ip FROM public.player_login_attempts
     WHERE ip = p_ip AND success = false AND attempted_at > now() - interval '15 minutes';
    IF v_fail_ip >= 20 THEN RAISE EXCEPTION 'rate_limited_ip'; END IF;
  END IF;
  
  SELECT * INTO v_p FROM public.players WHERE phone_normalized = v_phone AND active = true;
  IF v_p.id IS NULL OR NOT (v_p.pin_hash IS NOT NULL AND extensions.crypt(p_pin, v_p.pin_hash) = v_p.pin_hash) THEN
    INSERT INTO public.player_login_attempts (phone_normalized, ip, success) VALUES (v_phone, p_ip, false);
    RAISE EXCEPTION 'invalid_credentials';
  END IF;
  
  IF v_p.must_change_pin THEN 
    RAISE EXCEPTION 'pin_reset_required'; 
  END IF;
  
  INSERT INTO public.player_login_attempts (phone_normalized, ip, success) VALUES (v_phone, p_ip, true);
  
  v_ttl := CASE WHEN p_remember THEN 720 ELSE 8 END;
  SELECT s.session_id, s.token_plain, s.expires_at, s.absolute_expires_at
    INTO v_sess, v_tok, v_exp, v_abs
  FROM public.internal_create_session(v_p.id, p_ip, p_user_agent, v_ttl, p_remember, 2160) s;
  player_id := v_p.id; session_id := v_sess; token_plain := v_tok;
  expires_at := v_exp; absolute_expires_at := v_abs; remember := p_remember;
  RETURN NEXT;
END;
$function$;
