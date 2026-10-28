
DROP FUNCTION IF EXISTS public.internal_login_player(text, text, inet, text, boolean);

CREATE OR REPLACE FUNCTION public.admin_update_player_name(
  p_player_id uuid, p_new_name text, p_admin_user_id uuid
) RETURNS TABLE(player_id uuid, name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_name text;
BEGIN
  IF NOT public.has_role(p_admin_user_id, 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  v_name := btrim(coalesce(p_new_name,''));
  IF length(v_name) < 2 THEN RAISE EXCEPTION 'invalid_name'; END IF;
  UPDATE public.players SET name = v_name, updated_at = now() WHERE id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'player_not_found'; END IF;
  player_id := p_player_id; name := v_name; RETURN NEXT;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_update_player_name(uuid, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_request_pin_reset(
  p_player_id uuid, p_admin_user_id uuid
) RETURNS TABLE(player_id uuid, revoked_sessions int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_revoked int := 0;
BEGIN
  IF NOT public.has_role(p_admin_user_id, 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE public.players SET must_change_pin = true, updated_at = now() WHERE id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'player_not_found'; END IF;
  WITH d AS (DELETE FROM public.player_sessions WHERE player_id = p_player_id RETURNING 1)
  SELECT count(*)::int INTO v_revoked FROM d;
  player_id := p_player_id; revoked_sessions := v_revoked; RETURN NEXT;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_request_pin_reset(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.internal_login_player(p_phone text, p_pin text, p_ip inet, p_user_agent text)
RETURNS TABLE(player_id uuid, session_id uuid, token_plain text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_phone text; v_p public.players; v_fail_phone int; v_fail_ip int; v_sess uuid; v_tok text;
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
  IF v_p.id IS NULL OR NOT public.verify_pin(p_pin, v_p.pin_hash) THEN
    INSERT INTO public.player_login_attempts (phone_normalized, ip, success) VALUES (v_phone, p_ip, false);
    RAISE EXCEPTION 'invalid_credentials';
  END IF;
  INSERT INTO public.player_login_attempts (phone_normalized, ip, success) VALUES (v_phone, p_ip, true);
  IF v_p.must_change_pin THEN RAISE EXCEPTION 'pin_reset_required'; END IF;
  SELECT s.session_id, s.token_plain INTO v_sess, v_tok
    FROM public.internal_create_session(v_p.id, p_ip, p_user_agent, 720) s;
  player_id := v_p.id; session_id := v_sess; token_plain := v_tok; RETURN NEXT;
END; $function$;

CREATE OR REPLACE FUNCTION public.internal_login_player(p_phone text, p_pin text, p_ip inet, p_user_agent text, p_remember boolean DEFAULT false)
RETURNS TABLE(player_id uuid, session_id uuid, token_plain text, expires_at timestamp with time zone, absolute_expires_at timestamp with time zone, remember boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
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
  IF v_p.id IS NULL OR NOT public.verify_pin(p_pin, v_p.pin_hash) THEN
    INSERT INTO public.player_login_attempts (phone_normalized, ip, success) VALUES (v_phone, p_ip, false);
    RAISE EXCEPTION 'invalid_credentials';
  END IF;
  INSERT INTO public.player_login_attempts (phone_normalized, ip, success) VALUES (v_phone, p_ip, true);
  IF v_p.must_change_pin THEN RAISE EXCEPTION 'pin_reset_required'; END IF;
  v_ttl := CASE WHEN p_remember THEN 720 ELSE 8 END;
  SELECT s.session_id, s.token_plain, s.expires_at, s.absolute_expires_at
    INTO v_sess, v_tok, v_exp, v_abs
  FROM public.internal_create_session(v_p.id, p_ip, p_user_agent, v_ttl, p_remember, 2160) s;
  player_id := v_p.id; session_id := v_sess; token_plain := v_tok;
  expires_at := v_exp; absolute_expires_at := v_abs; remember := p_remember;
  RETURN NEXT;
END; $function$;

CREATE OR REPLACE FUNCTION public.internal_reset_pin(
  p_phone text, p_current_pin text, p_new_pin text,
  p_ip inet, p_user_agent text, p_remember boolean DEFAULT false
) RETURNS TABLE(player_id uuid, session_id uuid, token_plain text, expires_at timestamp with time zone, absolute_expires_at timestamp with time zone, remember boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_phone text; v_p public.players; v_fail_phone int; v_fail_ip int;
  v_sess uuid; v_tok text; v_exp timestamptz; v_abs timestamptz; v_ttl int;
BEGIN
  v_phone := public.normalize_phone(p_phone);
  IF v_phone = '' OR p_current_pin IS NULL OR p_current_pin = '' THEN RAISE EXCEPTION 'invalid_credentials'; END IF;
  IF p_new_pin IS NULL OR p_new_pin !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'invalid_new_pin'; END IF;
  IF p_new_pin = p_current_pin THEN RAISE EXCEPTION 'new_pin_must_differ'; END IF;
  SELECT count(*) INTO v_fail_phone FROM public.player_login_attempts
   WHERE phone_normalized = v_phone AND success = false AND attempted_at > now() - interval '15 minutes';
  IF v_fail_phone >= 5 THEN RAISE EXCEPTION 'rate_limited_phone'; END IF;
  IF p_ip IS NOT NULL THEN
    SELECT count(*) INTO v_fail_ip FROM public.player_login_attempts
     WHERE ip = p_ip AND success = false AND attempted_at > now() - interval '15 minutes';
    IF v_fail_ip >= 20 THEN RAISE EXCEPTION 'rate_limited_ip'; END IF;
  END IF;
  SELECT * INTO v_p FROM public.players WHERE phone_normalized = v_phone AND active = true;
  IF v_p.id IS NULL OR NOT public.verify_pin(p_current_pin, v_p.pin_hash) THEN
    INSERT INTO public.player_login_attempts (phone_normalized, ip, success) VALUES (v_phone, p_ip, false);
    RAISE EXCEPTION 'invalid_credentials';
  END IF;
  UPDATE public.players SET pin_hash = public.hash_pin(p_new_pin), must_change_pin = false, updated_at = now()
   WHERE id = v_p.id;
  INSERT INTO public.player_login_attempts (phone_normalized, ip, success) VALUES (v_phone, p_ip, true);
  v_ttl := CASE WHEN p_remember THEN 720 ELSE 8 END;
  SELECT s.session_id, s.token_plain, s.expires_at, s.absolute_expires_at
    INTO v_sess, v_tok, v_exp, v_abs
  FROM public.internal_create_session(v_p.id, p_ip, p_user_agent, v_ttl, p_remember, 2160) s;
  player_id := v_p.id; session_id := v_sess; token_plain := v_tok;
  expires_at := v_exp; absolute_expires_at := v_abs; remember := p_remember;
  RETURN NEXT;
END; $$;
GRANT EXECUTE ON FUNCTION public.internal_reset_pin(text, text, text, inet, text, boolean) TO service_role;
