
-- 1) Colunas novas em player_sessions
ALTER TABLE public.player_sessions
  ADD COLUMN IF NOT EXISTS remember boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS absolute_expires_at timestamptz;

-- Backfill absoluto para sessões antigas: created_at + 90 dias
UPDATE public.player_sessions
   SET absolute_expires_at = created_at + interval '90 days'
 WHERE absolute_expires_at IS NULL;

ALTER TABLE public.player_sessions
  ALTER COLUMN absolute_expires_at SET NOT NULL,
  ALTER COLUMN absolute_expires_at SET DEFAULT (now() + interval '90 days');

-- 2) internal_create_session — remember + absolute
CREATE OR REPLACE FUNCTION public.internal_create_session(
  p_player_id uuid,
  p_ip inet,
  p_user_agent text,
  p_ttl_hours integer DEFAULT 8,
  p_remember boolean DEFAULT false,
  p_absolute_hours integer DEFAULT 2160
)
RETURNS TABLE(session_id uuid, token_plain text, expires_at timestamptz, absolute_expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_token text;
  v_id uuid;
  v_exp timestamptz;
  v_abs timestamptz;
BEGIN
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  v_exp := now() + make_interval(hours => p_ttl_hours);
  v_abs := now() + make_interval(hours => p_absolute_hours);
  IF v_exp > v_abs THEN v_exp := v_abs; END IF;

  INSERT INTO public.player_sessions
    (player_id, token_hash, expires_at, absolute_expires_at, remember, ip, user_agent)
  VALUES
    (p_player_id, public.hash_token(v_token), v_exp, v_abs, p_remember, p_ip, p_user_agent)
  RETURNING id INTO v_id;

  session_id := v_id;
  token_plain := v_token;
  expires_at := v_exp;
  absolute_expires_at := v_abs;
  RETURN NEXT;
END;
$function$;

-- 3) internal_validate_session — checa absoluto, renova apenas se remember=true
CREATE OR REPLACE FUNCTION public.internal_validate_session(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_sess uuid;
  v_player uuid;
  v_remember boolean;
  v_abs timestamptz;
  v_new_exp timestamptz;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN RETURN NULL; END IF;

  SELECT id, player_id, remember, absolute_expires_at
    INTO v_sess, v_player, v_remember, v_abs
  FROM public.player_sessions
  WHERE token_hash = public.hash_token(p_token)
    AND revoked_at IS NULL
    AND expires_at > now()
    AND absolute_expires_at > now();

  IF v_player IS NULL THEN RETURN NULL; END IF;

  IF v_remember THEN
    -- Renovação deslizante de até 30 dias, nunca ultrapassando o absoluto
    v_new_exp := now() + interval '30 days';
    IF v_new_exp > v_abs THEN v_new_exp := v_abs; END IF;
    UPDATE public.player_sessions
       SET last_used_at = now(),
           expires_at = v_new_exp
     WHERE id = v_sess;
  ELSE
    -- Sem renovação; apenas last_used_at
    UPDATE public.player_sessions
       SET last_used_at = now()
     WHERE id = v_sess;
  END IF;

  RETURN v_player;
END;
$function$;

-- 4) internal_signup_player — aceita p_remember
CREATE OR REPLACE FUNCTION public.internal_signup_player(
  p_name text,
  p_phone text,
  p_pin text,
  p_ip inet,
  p_user_agent text,
  p_remember boolean DEFAULT false
)
RETURNS TABLE(player_id uuid, session_id uuid, token_plain text, expires_at timestamptz, absolute_expires_at timestamptz, remember boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_phone text;
  v_pid uuid;
  v_sess uuid;
  v_tok text;
  v_exp timestamptz;
  v_abs timestamptz;
  v_ttl int;
BEGIN
  IF p_name IS NULL OR length(btrim(p_name)) < 2 THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF p_pin IS NULL OR length(p_pin) < 4 OR length(p_pin) > 8 OR p_pin !~ '^[0-9]+$' THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;
  v_phone := public.normalize_phone(p_phone);
  IF length(v_phone) < 8 THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  IF EXISTS (SELECT 1 FROM public.players WHERE phone_normalized = v_phone) THEN
    RAISE EXCEPTION 'phone_already_registered';
  END IF;

  INSERT INTO public.players (name, phone, phone_normalized, pin_hash)
  VALUES (btrim(p_name), p_phone, v_phone, public.hash_pin(p_pin))
  RETURNING id INTO v_pid;

  v_ttl := CASE WHEN p_remember THEN 720 ELSE 8 END;

  SELECT s.session_id, s.token_plain, s.expires_at, s.absolute_expires_at
    INTO v_sess, v_tok, v_exp, v_abs
  FROM public.internal_create_session(v_pid, p_ip, p_user_agent, v_ttl, p_remember, 2160) s;

  player_id := v_pid;
  session_id := v_sess;
  token_plain := v_tok;
  expires_at := v_exp;
  absolute_expires_at := v_abs;
  remember := p_remember;
  RETURN NEXT;
END;
$function$;

-- 5) internal_login_player — aceita p_remember
CREATE OR REPLACE FUNCTION public.internal_login_player(
  p_phone text,
  p_pin text,
  p_ip inet,
  p_user_agent text,
  p_remember boolean DEFAULT false
)
RETURNS TABLE(player_id uuid, session_id uuid, token_plain text, expires_at timestamptz, absolute_expires_at timestamptz, remember boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_phone text;
  v_p public.players;
  v_fail_phone int;
  v_fail_ip int;
  v_sess uuid;
  v_tok text;
  v_exp timestamptz;
  v_abs timestamptz;
  v_ttl int;
BEGIN
  v_phone := public.normalize_phone(p_phone);
  IF v_phone = '' OR p_pin IS NULL OR p_pin = '' THEN RAISE EXCEPTION 'invalid_credentials'; END IF;

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

  INSERT INTO public.player_login_attempts (phone_normalized, ip, success)
  VALUES (v_phone, p_ip, true);

  v_ttl := CASE WHEN p_remember THEN 720 ELSE 8 END;

  SELECT s.session_id, s.token_plain, s.expires_at, s.absolute_expires_at
    INTO v_sess, v_tok, v_exp, v_abs
  FROM public.internal_create_session(v_p.id, p_ip, p_user_agent, v_ttl, p_remember, 2160) s;

  player_id := v_p.id;
  session_id := v_sess;
  token_plain := v_tok;
  expires_at := v_exp;
  absolute_expires_at := v_abs;
  remember := p_remember;
  RETURN NEXT;
END;
$function$;

-- 6) admin_revoke_all_sessions — verifica papel do chamador
CREATE OR REPLACE FUNCTION public.admin_revoke_all_sessions(p_target_player_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_admin uuid;
  v_count int;
BEGIN
  v_admin := auth.uid();
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = v_admin AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_target_player_id IS NULL THEN
    RAISE EXCEPTION 'invalid_target';
  END IF;

  UPDATE public.player_sessions
     SET revoked_at = now()
   WHERE player_id = p_target_player_id
     AND revoked_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_admin, 'admin_revoke_all_sessions', 'player', p_target_player_id,
          jsonb_build_object('revoked_count', v_count));

  RETURN v_count;
END;
$function$;

-- 7) Grants/revokes das novas assinaturas
REVOKE EXECUTE ON FUNCTION public.internal_create_session(uuid, inet, text, integer, boolean, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.internal_validate_session(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.internal_signup_player(text, text, text, inet, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.internal_login_player(text, text, inet, text, boolean) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_revoke_all_sessions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_all_sessions(uuid) TO authenticated;

-- 8) cleanup_expired — inclui sessões que passaram do absoluto
CREATE OR REPLACE FUNCTION public.cleanup_expired()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
  DELETE FROM public.player_login_attempts WHERE attempted_at < now() - interval '30 days';
  DELETE FROM public.player_search_hits    WHERE hit_at       < now() - interval '2 days';
  DELETE FROM public.player_sessions
    WHERE (expires_at < now() - interval '7 days')
       OR (absolute_expires_at < now() - interval '7 days')
       OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days');
$function$;
