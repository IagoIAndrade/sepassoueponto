-- =========================================================================
-- LOTE 1 - Migração 3: Admin RPCs, times, bloqueios, cron
-- =========================================================================

-- ---------- admin_add_player ----------
CREATE OR REPLACE FUNCTION public.admin_add_player(
  p_event_id uuid, p_target_player_id uuid, p_list_type public.list_type,
  p_admin_user_id uuid, p_force_override boolean DEFAULT false
)
RETURNS TABLE(registration_id uuid, list_type public.list_type, position_number int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_event public.volleyball_events; v_pos int; v_reg uuid; v_blocked boolean; v_main_cnt int;
BEGIN
  PERFORM public.lock_event(p_event_id);
  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_target_player_id AND active) THEN
    RAISE EXCEPTION 'player_not_available'; END IF;
  IF EXISTS (SELECT 1 FROM public.registrations WHERE event_id = p_event_id
             AND player_id = p_target_player_id AND cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'already_registered'; END IF;

  v_blocked := public.internal_is_blocked(p_target_player_id, v_event.event_date);
  IF v_blocked AND NOT p_force_override THEN RAISE EXCEPTION 'player_blocked'; END IF;

  IF p_list_type = 'main' THEN
    SELECT count(*) INTO v_main_cnt FROM public.registrations
     WHERE event_id = p_event_id AND list_type = 'main' AND cancelled_at IS NULL;
    IF v_main_cnt >= v_event.main_limit THEN RAISE EXCEPTION 'main_full'; END IF;
    v_pos := v_main_cnt + 1;
  ELSE
    SELECT coalesce(max(position_number),0)+1 INTO v_pos FROM public.registrations
     WHERE event_id = p_event_id AND list_type = 'wait' AND cancelled_at IS NULL;
  END IF;

  INSERT INTO public.registrations (event_id, player_id, registered_by_player_id, list_type, position_number)
  VALUES (p_event_id, p_target_player_id, p_target_player_id, p_list_type, v_pos)
  RETURNING id INTO v_reg;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id, 'admin_add_player', 'registration', v_reg,
          jsonb_build_object('event_id', p_event_id, 'player_id', p_target_player_id,
                             'list_type', p_list_type, 'force', p_force_override));

  registration_id := v_reg; list_type := p_list_type; position_number := v_pos; RETURN NEXT;
END; $$;
REVOKE ALL ON FUNCTION public.admin_add_player(uuid,uuid,public.list_type,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_add_player(uuid,uuid,public.list_type,uuid,boolean) TO service_role;

-- ---------- admin_remove_registration (delega para internal_leave sem autorização) ----------
CREATE OR REPLACE FUNCTION public.admin_remove_registration(
  p_registration_id uuid, p_admin_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_reg public.registrations; v_event_id uuid; v_promoted uuid; v_wait_row public.registrations; v_next_pos int;
BEGIN
  SELECT event_id INTO v_event_id FROM public.registrations WHERE id = p_registration_id;
  IF v_event_id IS NULL THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  PERFORM public.lock_event(v_event_id);

  SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id;
  IF v_reg.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'already_cancelled'; END IF;

  UPDATE public.registrations SET cancelled_at = now(), cancelled_by_player_id = NULL
   WHERE id = p_registration_id;

  IF v_reg.list_type = 'main' THEN
    UPDATE public.registrations SET position_number = position_number + 100000
     WHERE event_id = v_reg.event_id AND list_type = 'main' AND cancelled_at IS NULL AND position_number > v_reg.position_number;
    UPDATE public.registrations SET position_number = position_number - 100001
     WHERE event_id = v_reg.event_id AND list_type = 'main' AND cancelled_at IS NULL AND position_number > 100000;

    LOOP
      SELECT * INTO v_wait_row FROM public.registrations
       WHERE event_id = v_reg.event_id AND list_type = 'wait' AND cancelled_at IS NULL
       ORDER BY position_number ASC LIMIT 1;
      EXIT WHEN v_wait_row.id IS NULL;
      IF public.internal_is_blocked(v_wait_row.player_id,
           (SELECT event_date FROM public.volleyball_events WHERE id = v_reg.event_id)) THEN
        UPDATE public.registrations SET cancelled_at = now() WHERE id = v_wait_row.id;
        UPDATE public.registrations SET position_number = position_number + 100000
         WHERE event_id = v_reg.event_id AND list_type = 'wait' AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
        UPDATE public.registrations SET position_number = position_number - 100001
         WHERE event_id = v_reg.event_id AND list_type = 'wait' AND cancelled_at IS NULL AND position_number > 100000;
        INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
        VALUES (p_admin_user_id,'skip_blocked_on_promote','registration', v_wait_row.id,
                jsonb_build_object('event_id', v_reg.event_id));
        CONTINUE;
      END IF;
      SELECT coalesce(max(position_number),0)+1 INTO v_next_pos FROM public.registrations
       WHERE event_id = v_reg.event_id AND list_type = 'main' AND cancelled_at IS NULL;
      UPDATE public.registrations SET list_type = 'main', position_number = v_next_pos WHERE id = v_wait_row.id;
      UPDATE public.registrations SET position_number = position_number + 100000
       WHERE event_id = v_reg.event_id AND list_type = 'wait' AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
      UPDATE public.registrations SET position_number = position_number - 100001
       WHERE event_id = v_reg.event_id AND list_type = 'wait' AND cancelled_at IS NULL AND position_number > 100000;
      v_promoted := v_wait_row.id;
      EXIT;
    END LOOP;
  ELSE
    UPDATE public.registrations SET position_number = position_number + 100000
     WHERE event_id = v_reg.event_id AND list_type = 'wait' AND cancelled_at IS NULL AND position_number > v_reg.position_number;
    UPDATE public.registrations SET position_number = position_number - 100001
     WHERE event_id = v_reg.event_id AND list_type = 'wait' AND cancelled_at IS NULL AND position_number > 100000;
  END IF;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id, 'admin_remove_registration', 'registration', p_registration_id,
          jsonb_build_object('event_id', v_reg.event_id, 'player_id', v_reg.player_id, 'promoted_id', v_promoted));

  RETURN jsonb_build_object('cancelled_id', p_registration_id, 'promoted_id', v_promoted);
END; $$;
REVOKE ALL ON FUNCTION public.admin_remove_registration(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_remove_registration(uuid, uuid) TO service_role;

-- ---------- admin_move (troca lista/posição de uma inscrição ativa) ----------
CREATE OR REPLACE FUNCTION public.admin_move(
  p_registration_id uuid, p_new_list public.list_type, p_new_position int, p_admin_user_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_reg public.registrations; v_event public.volleyball_events;
        v_max_main int; v_max_wait int; v_shift_dir int;
BEGIN
  IF p_new_position < 1 THEN RAISE EXCEPTION 'invalid_position'; END IF;
  SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id;
  IF v_reg.id IS NULL OR v_reg.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  PERFORM public.lock_event(v_reg.event_id);
  SELECT * INTO v_event FROM public.volleyball_events WHERE id = v_reg.event_id;

  -- limites
  SELECT count(*) INTO v_max_main FROM public.registrations WHERE event_id = v_reg.event_id
    AND list_type = 'main' AND cancelled_at IS NULL AND id <> p_registration_id;
  SELECT count(*) INTO v_max_wait FROM public.registrations WHERE event_id = v_reg.event_id
    AND list_type = 'wait' AND cancelled_at IS NULL AND id <> p_registration_id;

  IF p_new_list = 'main' AND p_new_position > v_max_main + 1 THEN RAISE EXCEPTION 'invalid_position'; END IF;
  IF p_new_list = 'wait' AND p_new_position > v_max_wait + 1 THEN RAISE EXCEPTION 'invalid_position'; END IF;
  IF p_new_list = 'main' AND v_max_main + 1 > v_event.main_limit THEN RAISE EXCEPTION 'main_full'; END IF;

  -- move para offset alto para liberar posição alvo sem violar índice único
  UPDATE public.registrations SET position_number = position_number + 100000 WHERE id = p_registration_id;

  -- fechar buraco na lista de origem
  UPDATE public.registrations SET position_number = position_number + 200000
   WHERE event_id = v_reg.event_id AND list_type = v_reg.list_type AND cancelled_at IS NULL
     AND position_number > v_reg.position_number AND id <> p_registration_id;
  UPDATE public.registrations SET position_number = position_number - 200001
   WHERE event_id = v_reg.event_id AND list_type = v_reg.list_type AND cancelled_at IS NULL
     AND position_number > 200000 AND id <> p_registration_id;

  -- abrir espaço na lista de destino
  UPDATE public.registrations SET position_number = position_number + 200000
   WHERE event_id = v_reg.event_id AND list_type = p_new_list AND cancelled_at IS NULL
     AND position_number >= p_new_position AND id <> p_registration_id;
  UPDATE public.registrations SET position_number = position_number - 200000 + 1
   WHERE event_id = v_reg.event_id AND list_type = p_new_list AND cancelled_at IS NULL
     AND position_number > 200000 AND id <> p_registration_id;

  -- posicionar registro alvo
  UPDATE public.registrations SET list_type = p_new_list, position_number = p_new_position
   WHERE id = p_registration_id;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id,'admin_move','registration', p_registration_id,
          jsonb_build_object('from_list', v_reg.list_type, 'from_pos', v_reg.position_number,
                             'to_list', p_new_list, 'to_pos', p_new_position));
END; $$;
REVOKE ALL ON FUNCTION public.admin_move(uuid, public.list_type, int, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_move(uuid, public.list_type, int, uuid) TO service_role;

-- ---------- admin_block_player / admin_unblock_player ----------
CREATE OR REPLACE FUNCTION public.admin_block_player(
  p_player_id uuid, p_starts_at date, p_ends_at date,
  p_reason text, p_admin_notes text, p_admin_user_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.player_blocks (player_id, starts_at, ends_at, reason, admin_notes, created_by_admin_user_id)
  VALUES (p_player_id, p_starts_at, p_ends_at, p_reason, p_admin_notes, p_admin_user_id)
  RETURNING id INTO v_id;
  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id, 'admin_block_player', 'player_block', v_id,
          jsonb_build_object('player_id', p_player_id, 'starts_at', p_starts_at, 'ends_at', p_ends_at));
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.admin_block_player(uuid,date,date,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_block_player(uuid,date,date,text,text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_unblock_player(
  p_block_id uuid, p_admin_user_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.player_blocks
     SET active = false, ended_early_at = now(), ended_by_admin_user_id = p_admin_user_id
   WHERE id = p_block_id AND active = true;
  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id, 'admin_unblock_player', 'player_block', p_block_id, '{}'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.admin_unblock_player(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_unblock_player(uuid, uuid) TO service_role;

-- ---------- admin_save_teams ----------
-- p_assignments: [{"team_number":1,"registration_ids":["uuid",...]}, ...]
CREATE OR REPLACE FUNCTION public.admin_save_teams(
  p_event_id uuid, p_assignments jsonb, p_admin_user_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_item jsonb; v_team int; v_regs jsonb; v_reg_id uuid; v_team_id uuid;
        v_reg_arr uuid[]; v_all_seen uuid[] := ARRAY[]::uuid[];
BEGIN
  PERFORM public.lock_event(p_event_id);
  IF NOT EXISTS (SELECT 1 FROM public.volleyball_events WHERE id = p_event_id) THEN
    RAISE EXCEPTION 'event_not_found'; END IF;

  -- valida payload primeiro (sem persistir nada)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    v_team := (v_item->>'team_number')::int;
    IF v_team NOT IN (1,2,3) THEN RAISE EXCEPTION 'invalid_team_number'; END IF;
    v_regs := v_item->'registration_ids';
    IF jsonb_array_length(v_regs) > 6 THEN RAISE EXCEPTION 'team_too_large'; END IF;
    SELECT array_agg((value::text)::uuid) INTO v_reg_arr FROM jsonb_array_elements_text(v_regs);
    IF v_reg_arr IS NULL THEN v_reg_arr := ARRAY[]::uuid[]; END IF;

    -- todas as inscrições devem ser main + ativas + do mesmo evento
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

  -- duplicidade entre times
  IF (SELECT count(*) FROM unnest(v_all_seen)) <>
     (SELECT count(DISTINCT x) FROM unnest(v_all_seen) x) THEN
    RAISE EXCEPTION 'player_in_multiple_teams';
  END IF;

  -- limpar composição atual do evento
  DELETE FROM public.team_members WHERE team_id IN (SELECT id FROM public.teams WHERE event_id = p_event_id);
  DELETE FROM public.teams WHERE event_id = p_event_id;

  -- persistir
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_assignments) LOOP
    v_team := (v_item->>'team_number')::int;
    INSERT INTO public.teams (event_id, team_number) VALUES (p_event_id, v_team) RETURNING id INTO v_team_id;
    FOR v_reg_id IN SELECT (value::text)::uuid FROM jsonb_array_elements_text(v_item->'registration_ids') LOOP
      INSERT INTO public.team_members (team_id, registration_id) VALUES (v_team_id, v_reg_id);
    END LOOP;
  END LOOP;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id,'admin_save_teams','event', p_event_id, p_assignments);
END; $$;
REVOKE ALL ON FUNCTION public.admin_save_teams(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_save_teams(uuid, jsonb, uuid) TO service_role;

-- ---------- tick_events (automação) ----------
CREATE OR REPLACE FUNCTION public.tick_events() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  s public.app_settings;
  v_today  date;
  v_next_event_date date;
  v_opens  timestamptz;
  v_dow    int;
  v_delta  int;
BEGIN
  SELECT * INTO s FROM public.app_settings ORDER BY created_at ASC LIMIT 1;
  IF s.id IS NULL THEN RETURN; END IF;

  v_today := (now() AT TIME ZONE s.timezone)::date;

  -- próxima ocorrência do event_weekday >= hoje
  v_dow := EXTRACT(DOW FROM v_today)::int;
  v_delta := (s.event_weekday - v_dow + 7) % 7;
  v_next_event_date := v_today + v_delta;

  -- opens_at = sexta 12:00 da semana anterior (5 dias antes do event_date, no fuso)
  v_opens := (v_next_event_date - 5)::timestamp + s.open_time;
  v_opens := (v_opens AT TIME ZONE s.timezone);

  -- cria rodada se ainda não existe (idempotente via UNIQUE event_date)
  INSERT INTO public.volleyball_events
    (event_date, opens_at, status, location, start_time, end_time, main_limit, timezone)
  VALUES (v_next_event_date, v_opens, 'scheduled', s.location, s.start_time, s.end_time, s.main_limit, s.timezone)
  ON CONFLICT (event_date) DO NOTHING;

  -- abrir listas quando opens_at chegou (respeitando override)
  UPDATE public.volleyball_events
     SET status = 'open'
   WHERE status = 'scheduled' AND manual_override = false AND opens_at <= now();
END; $$;
REVOKE ALL ON FUNCTION public.tick_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tick_events() TO service_role;

-- ---------- Job cron a cada 5 min ----------
SELECT cron.schedule('volleyball-tick-events', '*/5 * * * *', $$SELECT public.tick_events();$$);

-- ---------- Limpeza periódica (diária às 03:00) ----------
CREATE OR REPLACE FUNCTION public.cleanup_expired() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  DELETE FROM public.player_login_attempts WHERE attempted_at < now() - interval '30 days';
  DELETE FROM public.player_search_hits    WHERE hit_at       < now() - interval '2 days';
  DELETE FROM public.player_sessions
    WHERE (expires_at < now() - interval '7 days') OR (revoked_at IS NOT NULL AND revoked_at < now() - interval '7 days');
$$;
REVOKE ALL ON FUNCTION public.cleanup_expired() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_expired() TO service_role;
SELECT cron.schedule('volleyball-cleanup', '0 3 * * *', $$SELECT public.cleanup_expired();$$);
