-- =========================================================================
-- LOTE 1 - Migração 2: Funções internas
-- =========================================================================

-- ---------- Utilitários ----------
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT regexp_replace(coalesce(p,''), '[^0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.hash_pin(p_pin text)
RETURNS text LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_pin IS NULL OR length(p_pin) < 4 THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;
  RETURN extensions.crypt(p_pin, extensions.gen_salt('bf', 10));
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_pin(p_pin text, p_hash text)
RETURNS boolean LANGUAGE sql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_hash IS NOT NULL AND extensions.crypt(p_pin, p_hash) = p_hash;
$$;

CREATE OR REPLACE FUNCTION public.hash_token(p_token text)
RETURNS text LANGUAGE sql IMMUTABLE
SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT encode(extensions.digest(p_token, 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION public.hash_pin(text)             FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_pin(text, text)     FROM PUBLIC;
REVOKE ALL ON FUNCTION public.hash_token(text)           FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hash_pin(text)          TO service_role;
GRANT EXECUTE ON FUNCTION public.verify_pin(text, text)  TO service_role;
GRANT EXECUTE ON FUNCTION public.hash_token(text)        TO service_role;

-- ---------- Leituras públicas ----------
CREATE OR REPLACE FUNCTION public.get_public_settings()
RETURNS TABLE(location text, start_time time, end_time time, main_limit int, timezone text)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT location, start_time, end_time, main_limit, timezone
  FROM public.app_settings ORDER BY created_at ASC LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_settings() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_public_current_event()
RETURNS TABLE(
  id uuid, event_date date, opens_at timestamptz, closes_at timestamptz,
  status public.event_status, location text, start_time time, end_time time, main_limit int
)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT e.id, e.event_date, e.opens_at, e.closes_at, e.status,
         e.location, e.start_time, e.end_time, e.main_limit
  FROM public.volleyball_events e
  WHERE e.status IN ('open','scheduled','closed')
  ORDER BY
    CASE WHEN e.status = 'open' THEN 0 WHEN e.status = 'scheduled' THEN 1 ELSE 2 END,
    e.event_date ASC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_public_current_event() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_current_event() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_public_registrations(p_event_id uuid)
RETURNS TABLE(player_name text, list_type public.list_type, position_number int, created_at timestamptz)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p.name, r.list_type, r.position_number, r.created_at
  FROM public.registrations r
  JOIN public.players p ON p.id = r.player_id
  WHERE r.event_id = p_event_id AND r.cancelled_at IS NULL
  ORDER BY r.list_type, r.position_number;
$$;
REVOKE ALL ON FUNCTION public.get_public_registrations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_registrations(uuid) TO anon, authenticated, service_role;

-- ---------- Sessão ----------
CREATE OR REPLACE FUNCTION public.internal_create_session(
  p_player_id uuid, p_ip inet, p_user_agent text, p_ttl_hours int DEFAULT 720
)
RETURNS TABLE(session_id uuid, token_plain text)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_token text; v_id uuid;
BEGIN
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.player_sessions (player_id, token_hash, expires_at, ip, user_agent)
  VALUES (p_player_id, public.hash_token(v_token), now() + make_interval(hours => p_ttl_hours), p_ip, p_user_agent)
  RETURNING id INTO v_id;
  session_id := v_id; token_plain := v_token; RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_validate_session(p_token text)
RETURNS uuid LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_player uuid; v_sess uuid;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN RETURN NULL; END IF;
  SELECT id, player_id INTO v_sess, v_player
  FROM public.player_sessions
  WHERE token_hash = public.hash_token(p_token)
    AND revoked_at IS NULL AND expires_at > now();
  IF v_player IS NULL THEN RETURN NULL; END IF;
  UPDATE public.player_sessions SET last_used_at = now() WHERE id = v_sess;
  RETURN v_player;
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_revoke_session(p_token text)
RETURNS void LANGUAGE sql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.player_sessions SET revoked_at = now()
  WHERE token_hash = public.hash_token(p_token) AND revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.internal_create_session(uuid, inet, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_validate_session(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_revoke_session(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_create_session(uuid, inet, text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_validate_session(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_revoke_session(text) TO service_role;

-- ---------- Bloqueio ----------
CREATE OR REPLACE FUNCTION public.internal_is_blocked(p_player_id uuid, p_event_date date)
RETURNS boolean LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.player_blocks
    WHERE player_id = p_player_id AND active = true
      AND p_event_date BETWEEN starts_at AND ends_at
  );
$$;
REVOKE ALL ON FUNCTION public.internal_is_blocked(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_is_blocked(uuid, date) TO service_role;

-- ---------- Advisory lock helper ----------
CREATE OR REPLACE FUNCTION public.lock_event(p_event_id uuid)
RETURNS void LANGUAGE sql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT pg_advisory_xact_lock(hashtextextended(p_event_id::text, 42));
$$;
REVOKE ALL ON FUNCTION public.lock_event(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lock_event(uuid) TO service_role;

-- ---------- internal_join_event ----------
CREATE OR REPLACE FUNCTION public.internal_join_event(
  p_event_id uuid,
  p_target_player_id uuid,
  p_responsible_player_id uuid,
  p_force_override boolean DEFAULT false
)
RETURNS TABLE(registration_id uuid, list_type public.list_type, position_number int)
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_event    public.volleyball_events;
  v_target   public.players;
  v_resp_cnt int;
  v_main_cnt int;
  v_pos      int;
  v_list     public.list_type;
  v_reg_id   uuid;
  v_blocked  boolean;
BEGIN
  PERFORM public.lock_event(p_event_id);

  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF v_event.status <> 'open' THEN RAISE EXCEPTION 'event_not_open'; END IF;

  SELECT * INTO v_target FROM public.players WHERE id = p_target_player_id;
  IF v_target.id IS NULL OR NOT v_target.active THEN RAISE EXCEPTION 'player_not_available'; END IF;

  -- bloqueio
  v_blocked := public.internal_is_blocked(p_target_player_id, v_event.event_date);
  IF v_blocked AND NOT p_force_override THEN RAISE EXCEPTION 'player_blocked'; END IF;

  -- duplicidade
  IF EXISTS (
    SELECT 1 FROM public.registrations
    WHERE event_id = p_event_id AND player_id = p_target_player_id AND cancelled_at IS NULL
  ) THEN RAISE EXCEPTION 'already_registered'; END IF;

  -- limite de 2 por responsável
  SELECT count(*) INTO v_resp_cnt FROM public.registrations
  WHERE event_id = p_event_id AND registered_by_player_id = p_responsible_player_id
    AND cancelled_at IS NULL;
  IF v_resp_cnt >= 2 THEN RAISE EXCEPTION 'responsible_limit_reached'; END IF;

  -- decidir lista
  SELECT count(*) INTO v_main_cnt FROM public.registrations
  WHERE event_id = p_event_id AND list_type = 'main' AND cancelled_at IS NULL;

  IF v_main_cnt < v_event.main_limit THEN
    v_list := 'main';
    v_pos  := v_main_cnt + 1;
  ELSE
    v_list := 'wait';
    SELECT coalesce(max(position_number),0)+1 INTO v_pos FROM public.registrations
     WHERE event_id = p_event_id AND list_type = 'wait' AND cancelled_at IS NULL;
  END IF;

  INSERT INTO public.registrations (event_id, player_id, registered_by_player_id, list_type, position_number)
  VALUES (p_event_id, p_target_player_id, p_responsible_player_id, v_list, v_pos)
  RETURNING id INTO v_reg_id;

  IF p_force_override AND v_blocked THEN
    INSERT INTO public.admin_actions_log (action, target_type, target_id, details)
    VALUES ('force_add_blocked', 'registration', v_reg_id,
            jsonb_build_object('player_id', p_target_player_id, 'event_id', p_event_id));
  END IF;

  registration_id := v_reg_id; list_type := v_list; position_number := v_pos; RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION public.internal_join_event(uuid, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_join_event(uuid, uuid, uuid, boolean) TO service_role;

-- ---------- internal_leave_registration ----------
CREATE OR REPLACE FUNCTION public.internal_leave_registration(
  p_registration_id uuid,
  p_requester_player_id uuid
)
RETURNS jsonb LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_reg      public.registrations;
  v_event_id uuid;
  v_promoted uuid;
  v_wait_row public.registrations;
  v_next_pos int;
BEGIN
  SELECT event_id INTO v_event_id FROM public.registrations WHERE id = p_registration_id;
  IF v_event_id IS NULL THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  PERFORM public.lock_event(v_event_id);

  SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id;
  IF v_reg.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'already_cancelled'; END IF;

  -- autorização: responsável OU o próprio jogador
  IF v_reg.registered_by_player_id <> p_requester_player_id
     AND v_reg.player_id <> p_requester_player_id THEN
     RAISE EXCEPTION 'not_authorized';
  END IF;

  -- cancela
  UPDATE public.registrations
     SET cancelled_at = now(), cancelled_by_player_id = p_requester_player_id
   WHERE id = p_registration_id;

  -- renumeração em 2 etapas (offset positivo alto)
  IF v_reg.list_type = 'main' THEN
    UPDATE public.registrations SET position_number = position_number + 100000
     WHERE event_id = v_reg.event_id AND list_type = 'main'
       AND cancelled_at IS NULL AND position_number > v_reg.position_number;
    UPDATE public.registrations SET position_number = position_number - 100001
     WHERE event_id = v_reg.event_id AND list_type = 'main'
       AND cancelled_at IS NULL AND position_number > 100000;

    -- promover primeiro elegível (não bloqueado) da wait
    LOOP
      SELECT * INTO v_wait_row FROM public.registrations
       WHERE event_id = v_reg.event_id AND list_type = 'wait' AND cancelled_at IS NULL
       ORDER BY position_number ASC LIMIT 1;
      EXIT WHEN v_wait_row.id IS NULL;

      IF public.internal_is_blocked(v_wait_row.player_id,
           (SELECT event_date FROM public.volleyball_events WHERE id = v_reg.event_id)) THEN
        -- pula: cancela essa entrada da wait com log e continua o loop
        UPDATE public.registrations SET cancelled_at = now(), cancelled_by_player_id = NULL
         WHERE id = v_wait_row.id;
        -- fecha o buraco na wait
        UPDATE public.registrations SET position_number = position_number + 100000
         WHERE event_id = v_reg.event_id AND list_type = 'wait'
           AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
        UPDATE public.registrations SET position_number = position_number - 100001
         WHERE event_id = v_reg.event_id AND list_type = 'wait'
           AND cancelled_at IS NULL AND position_number > 100000;
        INSERT INTO public.admin_actions_log (action, target_type, target_id, details)
        VALUES ('skip_blocked_on_promote','registration', v_wait_row.id,
                jsonb_build_object('event_id', v_reg.event_id, 'player_id', v_wait_row.player_id));
        CONTINUE;
      END IF;

      -- promove
      SELECT coalesce(max(position_number),0)+1 INTO v_next_pos FROM public.registrations
       WHERE event_id = v_reg.event_id AND list_type = 'main' AND cancelled_at IS NULL;
      UPDATE public.registrations
         SET list_type = 'main', position_number = v_next_pos
       WHERE id = v_wait_row.id;
      -- fecha buraco na wait
      UPDATE public.registrations SET position_number = position_number + 100000
       WHERE event_id = v_reg.event_id AND list_type = 'wait'
         AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
      UPDATE public.registrations SET position_number = position_number - 100001
       WHERE event_id = v_reg.event_id AND list_type = 'wait'
         AND cancelled_at IS NULL AND position_number > 100000;
      v_promoted := v_wait_row.id;
      EXIT;
    END LOOP;
  ELSE
    -- saiu da wait: apenas renumera wait
    UPDATE public.registrations SET position_number = position_number + 100000
     WHERE event_id = v_reg.event_id AND list_type = 'wait'
       AND cancelled_at IS NULL AND position_number > v_reg.position_number;
    UPDATE public.registrations SET position_number = position_number - 100001
     WHERE event_id = v_reg.event_id AND list_type = 'wait'
       AND cancelled_at IS NULL AND position_number > 100000;
  END IF;

  RETURN jsonb_build_object('cancelled_id', p_registration_id, 'promoted_id', v_promoted);
END;
$$;
REVOKE ALL ON FUNCTION public.internal_leave_registration(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_leave_registration(uuid, uuid) TO service_role;

-- ---------- internal_get_my_registrations ----------
CREATE OR REPLACE FUNCTION public.internal_get_my_registrations(
  p_event_id uuid, p_player_id uuid
)
RETURNS TABLE(
  id uuid, player_id uuid, player_name text, list_type public.list_type,
  position_number int, is_responsible boolean, is_self boolean
)
LANGUAGE sql STABLE
SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.id, r.player_id, p.name, r.list_type, r.position_number,
         r.registered_by_player_id = p_player_id AS is_responsible,
         r.player_id = p_player_id AS is_self
  FROM public.registrations r
  JOIN public.players p ON p.id = r.player_id
  WHERE r.event_id = p_event_id AND r.cancelled_at IS NULL
    AND (r.registered_by_player_id = p_player_id OR r.player_id = p_player_id)
  ORDER BY r.list_type, r.position_number;
$$;
REVOKE ALL ON FUNCTION public.internal_get_my_registrations(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_get_my_registrations(uuid, uuid) TO service_role;

-- ---------- internal_search_players ----------
CREATE OR REPLACE FUNCTION public.internal_search_players(
  p_query text, p_session_id uuid, p_event_id uuid
)
RETURNS TABLE(id uuid, name text)
LANGUAGE plpgsql STABLE
SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_hits int; v_q text;
BEGIN
  -- rate limit 30/min por sessão
  SELECT count(*) INTO v_hits FROM public.player_search_hits
   WHERE session_id = p_session_id AND hit_at > now() - interval '1 minute';
  IF v_hits >= 30 THEN RAISE EXCEPTION 'rate_limited'; END IF;
  INSERT INTO public.player_search_hits (session_id) VALUES (p_session_id);

  v_q := lower(btrim(coalesce(p_query,'')));
  IF length(v_q) < 2 THEN RETURN; END IF;

  RETURN QUERY
    SELECT p.id, p.name
    FROM public.players p
    WHERE p.active = true
      AND p.name_normalized LIKE v_q || '%'
      AND NOT EXISTS (
        SELECT 1 FROM public.registrations r
         WHERE r.event_id = p_event_id AND r.player_id = p.id AND r.cancelled_at IS NULL
      )
    ORDER BY p.name_normalized ASC
    LIMIT 10;
END;
$$;
REVOKE ALL ON FUNCTION public.internal_search_players(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.internal_search_players(text, uuid, uuid) TO service_role;
