-- 1) has_role endurecida: só permite consultar o próprio auth.uid(), exceto service_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('request.jwt.claims', true) IS NOT NULL
     AND current_setting('role', true) <> 'service_role'
     AND _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'has_role: not authorized to inspect other users';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

-- 2) Assinatura preferencial sem parâmetro de user_id
CREATE OR REPLACE FUNCTION public.current_user_has_role(_role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = _role
  );
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_has_role(app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(app_role) TO authenticated, service_role;

-- 3) internal_signup_player: cria jogador + sessão
CREATE OR REPLACE FUNCTION public.internal_signup_player(
  p_name text, p_phone text, p_pin text, p_ip inet, p_user_agent text
) RETURNS TABLE(player_id uuid, session_id uuid, token_plain text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_phone text; v_pid uuid; v_sess uuid; v_tok text;
BEGIN
  IF p_name IS NULL OR length(btrim(p_name)) < 2 THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF p_pin IS NULL OR length(p_pin) < 4 OR length(p_pin) > 8 OR p_pin !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'invalid_pin'; END IF;
  v_phone := public.normalize_phone(p_phone);
  IF length(v_phone) < 8 THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  IF EXISTS (SELECT 1 FROM public.players WHERE phone_normalized = v_phone) THEN
    RAISE EXCEPTION 'phone_already_registered';
  END IF;
  INSERT INTO public.players (name, phone, phone_normalized, pin_hash)
  VALUES (btrim(p_name), p_phone, v_phone, public.hash_pin(p_pin))
  RETURNING id INTO v_pid;
  SELECT s.session_id, s.token_plain INTO v_sess, v_tok
    FROM public.internal_create_session(v_pid, p_ip, p_user_agent, 720) s;
  player_id := v_pid; session_id := v_sess; token_plain := v_tok; RETURN NEXT;
END; $$;

REVOKE EXECUTE ON FUNCTION public.internal_signup_player(text,text,text,inet,text) FROM PUBLIC, anon, authenticated;

-- 4) internal_login_player: rate limit + verificação + sessão
CREATE OR REPLACE FUNCTION public.internal_login_player(
  p_phone text, p_pin text, p_ip inet, p_user_agent text
) RETURNS TABLE(player_id uuid, session_id uuid, token_plain text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_phone text; v_p public.players; v_fail_phone int; v_fail_ip int; v_sess uuid; v_tok text;
BEGIN
  v_phone := public.normalize_phone(p_phone);
  IF v_phone = '' OR p_pin IS NULL OR p_pin = '' THEN RAISE EXCEPTION 'invalid_credentials'; END IF;

  -- rate limit: 5 falhas em 15min por telefone ou IP
  SELECT count(*) INTO v_fail_phone FROM public.player_login_attempts
   WHERE phone_normalized = v_phone AND success = false
     AND attempted_at > now() - interval '15 minutes';
  IF v_fail_phone >= 5 THEN RAISE EXCEPTION 'rate_limited_phone'; END IF;
  IF p_ip IS NOT NULL THEN
    SELECT count(*) INTO v_fail_ip FROM public.player_login_attempts
     WHERE ip = p_ip AND success = false
       AND attempted_at > now() - interval '15 minutes';
    IF v_fail_ip >= 20 THEN RAISE EXCEPTION 'rate_limited_ip'; END IF;
  END IF;

  SELECT * INTO v_p FROM public.players WHERE phone_normalized = v_phone AND active = true;
  IF v_p.id IS NULL OR NOT public.verify_pin(p_pin, v_p.pin_hash) THEN
    INSERT INTO public.player_login_attempts (phone_normalized, ip, success)
    VALUES (v_phone, p_ip, false);
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  INSERT INTO public.player_login_attempts (phone_normalized, ip, success) VALUES (v_phone, p_ip, true);

  SELECT s.session_id, s.token_plain INTO v_sess, v_tok
    FROM public.internal_create_session(v_p.id, p_ip, p_user_agent, 720) s;
  player_id := v_p.id; session_id := v_sess; token_plain := v_tok; RETURN NEXT;
END; $$;

REVOKE EXECUTE ON FUNCTION public.internal_login_player(text,text,inet,text) FROM PUBLIC, anon, authenticated;

-- 5) internal_get_player: perfil básico por id
CREATE OR REPLACE FUNCTION public.internal_get_player(p_player_id uuid)
RETURNS TABLE(id uuid, name text, phone_normalized text, must_change_pin boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id, name, phone_normalized, must_change_pin
  FROM public.players WHERE id = p_player_id AND active = true;
$$;

REVOKE EXECUTE ON FUNCTION public.internal_get_player(uuid) FROM PUBLIC, anon, authenticated;