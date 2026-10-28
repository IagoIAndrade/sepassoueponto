-- =====================================================================
-- MIGRAÇÃO INCREMENTAL: CONSOLIDAÇÃO DE ABERTURA AUTOMÁTICA E CICLO
-- Arquivo: 20260920000000_fix_auto_open_incremental.sql
-- Base auditada: 17/09, 18/09 e 19/09
-- =====================================================================

------------------------------------------------------------------------
-- 1. internal_process_event_opening: Abertura atômica e autoinscrição
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_process_event_opening(p_event_id uuid, p_force boolean DEFAULT false)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_event public.volleyball_events%ROWTYPE;
  v_settings public.app_settings%ROWTYPE;
  v_organizer record;
  v_enrolled_count integer := 0;
  v_already_count integer := 0;
  v_skipped_count integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_base_time timestamptz;
  v_now timestamptz := now();
  v_target_list public.list_type;
  v_current_main integer;
  v_current_wait integer;
  v_main_limit integer;
  v_wait_limit integer;
  v_next_pos integer;
  v_caller_role text;
  v_is_blocked boolean;
BEGIN
  -- 1. Proteção contra bypass de p_force por usuários não privilegiados
  IF p_force THEN
    v_caller_role := COALESCE(current_setting('role', true), '');
    IF v_caller_role NOT IN ('service_role') AND current_user <> 'postgres' THEN
      IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
        RAISE EXCEPTION 'not_authorized: p_force requires admin privileges' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- 2. Lock determinístico do evento
  PERFORM public.lock_event(p_event_id);

  SELECT *
  INTO v_event
  FROM public.volleyball_events
  WHERE id = p_event_id
  FOR UPDATE;

  IF v_event.id IS NULL THEN
    RETURN json_build_object('ok', false, 'message', 'Evento não encontrado');
  END IF;

  -- Não reorganiza rodada que já está aberta
  IF v_event.status = 'open'::public.event_status THEN
    RETURN json_build_object(
      'ok', true,
      'message', 'Evento já processado ou em outro status',
      'status', v_event.status
    );
  END IF;

  IF v_event.status IS DISTINCT FROM 'scheduled'::public.event_status THEN
    RETURN json_build_object(
      'ok', false,
      'message', 'Evento já processado ou em outro status',
      'status', v_event.status
    );
  END IF;

  IF NOT p_force AND v_event.opens_at > v_now THEN
    RETURN json_build_object('ok', false, 'message', 'Horário de abertura ainda não chegou');
  END IF;

  -- Bloqueia inscrições correntes do evento para evitar concorrência
  PERFORM 1
  FROM public.registrations
  WHERE event_id = p_event_id
  FOR UPDATE;

  SELECT *
  INTO v_settings
  FROM public.app_settings
  WHERE group_id = v_event.group_id
  LIMIT 1;

  v_base_time := v_now;
  v_main_limit := COALESCE(v_event.main_limit, v_settings.main_limit, 18);
  v_wait_limit := COALESCE(
    v_event.wait_limit,
    v_settings.wait_limit,
    (to_jsonb(v_settings)->>'max_waitlist')::integer,
    (to_jsonb(v_settings)->>'waitlist_limit')::integer,
    NULL
  );

  -- 3. Itera sobre organizadores aprovados da turma específica
  FOR v_organizer IN
    SELECT pg.player_id, p.name, pg.organizer_order
    FROM public.player_groups pg
    JOIN public.players p ON p.id = pg.player_id
    WHERE pg.group_id = v_event.group_id
      AND pg.is_organizer = true
      AND pg.status = 'approved'
      AND p.active = true
    ORDER BY pg.organizer_order ASC NULLS LAST, p.name ASC, pg.player_id ASC
  LOOP
    -- Validação disciplinar estrita por turma e data
    v_is_blocked := public.internal_is_blocked(v_organizer.player_id, v_event.event_date, v_event.group_id);
    IF COALESCE(v_is_blocked, false) THEN
      v_skipped_count := v_skipped_count + 1;
      v_details := v_details || jsonb_build_object(
        'player_id', v_organizer.player_id,
        'player', v_organizer.name,
        'status', 'blocked'
      );
      CONTINUE;
    END IF;

    -- Evita duplicidade se já inscrito ativamente
    IF EXISTS (
      SELECT 1
      FROM public.registrations r
      WHERE r.event_id = p_event_id
        AND r.player_id = v_organizer.player_id
        AND r.cancelled_at IS NULL
    ) THEN
      v_already_count := v_already_count + 1;
      v_details := v_details || jsonb_build_object(
        'player_id', v_organizer.player_id,
        'player', v_organizer.name,
        'status', 'already_present'
      );
      CONTINUE;
    END IF;

    -- Contagem atual de titulares e reserva
    SELECT count(*)::integer
    INTO v_current_main
    FROM public.registrations r
    WHERE r.event_id = p_event_id
      AND r.list_type = 'main'::public.list_type
      AND r.cancelled_at IS NULL;

    IF v_current_main < v_main_limit THEN
      v_target_list := 'main'::public.list_type;
    ELSE
      SELECT count(*)::integer
      INTO v_current_wait
      FROM public.registrations r
      WHERE r.event_id = p_event_id
        AND r.list_type = 'wait'::public.list_type
        AND r.cancelled_at IS NULL;

      IF v_wait_limit IS NOT NULL AND v_current_wait >= v_wait_limit THEN
        v_skipped_count := v_skipped_count + 1;
        v_details := v_details || jsonb_build_object(
          'player_id', v_organizer.player_id,
          'player', v_organizer.name,
          'status', 'waitlist_full'
        );
        CONTINUE;
      END IF;

      v_target_list := 'wait'::public.list_type;
    END IF;

    -- Posição livre real por tipo de lista
    SELECT COALESCE(max(r.position_number), 0) + 1
    INTO v_next_pos
    FROM public.registrations r
    WHERE r.event_id = p_event_id
      AND r.list_type = v_target_list
      AND r.cancelled_at IS NULL;

    BEGIN
      INSERT INTO public.registrations (
        event_id,
        player_id,
        list_type,
        registration_source,
        registered_by_player_id,
        position_number,
        created_at
      ) VALUES (
        p_event_id,
        v_organizer.player_id,
        v_target_list,
        'organizer_auto',
        v_organizer.player_id,
        v_next_pos,
        v_base_time + (COALESCE(v_organizer.organizer_order, 99) * interval '1 millisecond')
      );

      v_enrolled_count := v_enrolled_count + 1;
      v_details := v_details || jsonb_build_object(
        'player_id', v_organizer.player_id,
        'player', v_organizer.name,
        'list_type', v_target_list,
        'position', v_next_pos,
        'status', 'enrolled'
      );
    EXCEPTION WHEN unique_violation THEN
      v_already_count := v_already_count + 1;
      v_details := v_details || jsonb_build_object(
        'player_id', v_organizer.player_id,
        'player', v_organizer.name,
        'status', 'already_present'
      );
    WHEN OTHERS THEN
      v_skipped_count := v_skipped_count + 1;
      v_details := v_details || jsonb_build_object(
        'player_id', v_organizer.player_id,
        'player', v_organizer.name,
        'status', 'error',
        'error', SQLERRM
      );
    END;
  END LOOP;

  -- 4. Atualização segura de status e metadados
  UPDATE public.volleyball_events
  SET status = 'open'::public.event_status,
      organizers_auto_enrolled_at = COALESCE(organizers_auto_enrolled_at, v_now),
      manual_override = CASE WHEN p_force THEN true ELSE manual_override END,
      opens_at = CASE WHEN p_force AND opens_at > v_now THEN v_now ELSE opens_at END
  WHERE id = p_event_id
    AND status = 'scheduled'::public.event_status;

  RETURN json_build_object(
    'ok', true,
    'event_id', p_event_id,
    'enrolled_count', v_enrolled_count,
    'already_count', v_already_count,
    'skipped_count', v_skipped_count,
    'main_limit', v_main_limit,
    'wait_limit', v_wait_limit,
    'details', v_details
  );
END;
$$
;

-- Sobrecarga legado (p_event_id)
CREATE OR REPLACE FUNCTION public.internal_process_event_opening(p_event_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  RETURN public.internal_process_event_opening(p_event_id, false);
END;
$$
;

REVOKE ALL ON FUNCTION public.internal_process_event_opening(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_process_event_opening(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.internal_process_event_opening(uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_process_event_opening(uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.internal_process_event_opening(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_process_event_opening(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.internal_process_event_opening(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_process_event_opening(uuid) TO service_role;

------------------------------------------------------------------------
-- 2. get_public_current_event: fallback seguro de autoabertura sob demanda
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_current_event(p_group_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  id uuid,
  event_date date,
  opens_at timestamp with time zone,
  closes_at timestamp with time zone,
  status public.event_status,
  location text,
  start_time time without time zone,
  end_time time without time zone,
  main_limit integer,
  priority_minutes integer,
  group_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_group_id uuid := COALESCE(p_group_id, public.internal_default_group_id());
  v_event public.volleyball_events%ROWTYPE;
  v_settings public.app_settings%ROWTYPE;
  v_today date;
  v_close_date date;
  v_close_delta integer;
  v_open_result json;
BEGIN
  IF v_group_id IS NULL THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_settings
  FROM public.app_settings s
  WHERE s.group_id = v_group_id
  LIMIT 1;

  v_today := (now() AT TIME ZONE COALESCE(v_settings.timezone, 'America/Sao_Paulo'))::date;

  SELECT *
  INTO v_event
  FROM public.volleyball_events e
  WHERE e.group_id = v_group_id
    AND e.event_date >= v_today
    AND e.status IN ('scheduled'::public.event_status, 'open'::public.event_status, 'closed'::public.event_status)
  ORDER BY e.event_date ASC, e.start_time ASC, e.id ASC
  LIMIT 1;

  IF v_event.id IS NULL THEN
    RETURN;
  END IF;

  -- Abertura segura em background se horário atingido
  IF COALESCE(v_settings.auto_open, true)
     AND v_event.status = 'scheduled'::public.event_status
     AND v_event.opens_at <= now()
     AND COALESCE(v_event.manual_override, false) = false
  THEN
    v_open_result := public.internal_process_event_opening(v_event.id, false);

    IF COALESCE((v_open_result->>'ok')::boolean, false) THEN
      SELECT *
      INTO v_event
      FROM public.volleyball_events e
      WHERE e.id = v_event.id;
    END IF;
  END IF;

  IF v_event.closes_at IS NOT NULL THEN
    closes_at := v_event.closes_at;
  ELSE
    v_close_delta := (
      COALESCE(v_settings.close_weekday, EXTRACT(DOW FROM v_event.event_date)::integer)
      - EXTRACT(DOW FROM v_event.event_date)::integer
      + 7
    ) % 7;
    v_close_date := v_event.event_date + v_close_delta;
    closes_at := (v_close_date::text || ' ' || COALESCE(v_settings.close_time, '23:59:59'::time)::text)::timestamp
      AT TIME ZONE COALESCE(v_settings.timezone, v_event.timezone, 'America/Sao_Paulo');
  END IF;

  id := v_event.id;
  event_date := v_event.event_date;
  opens_at := v_event.opens_at;
  status := v_event.status;
  location := v_event.location;
  start_time := v_event.start_time;
  end_time := v_event.end_time;
  main_limit := v_event.main_limit;
  priority_minutes := COALESCE(v_event.priority_minutes, v_settings.priority_minutes, 0);
  group_id := v_event.group_id;

  RETURN NEXT;
END;
$$
;

GRANT EXECUTE ON FUNCTION public.get_public_current_event(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_current_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_current_event(uuid) TO service_role;

------------------------------------------------------------------------
-- 3. internal_cycle_rounds: Gestão unificada de abertura, fecho e criação
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_cycle_rounds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_group record;
  v_event record;
  v_now timestamptz := now();
  v_closed_count int := 0;
  v_created_count int := 0;
  v_opened_count int := 0;
  v_res jsonb;
  v_open_res json;
  v_close_at timestamptz;
  v_delta int;
  v_msg text;
  v_base_date date;
BEGIN
  -- 1. Abertura das rodadas agendadas cujo horário chegou
  FOR v_event IN
    SELECT e.id, e.event_date, e.status, e.group_id, e.opens_at, e.manual_override,
           s.auto_open
    FROM public.volleyball_events e
    JOIN public.app_settings s ON s.group_id = e.group_id
    WHERE e.status = 'scheduled'::public.event_status
      AND COALESCE(e.manual_override, false) = false
      AND COALESCE(s.auto_open, true) = true
      AND e.opens_at <= v_now
    ORDER BY e.opens_at ASC, e.id ASC
  LOOP
    BEGIN
      v_open_res := public.internal_process_event_opening(v_event.id, false);
      IF COALESCE((v_open_res->>'ok')::boolean, false) THEN
        v_opened_count := v_opened_count + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_msg := SQLERRM;
      INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
      VALUES (NULL, 'AUTO_ROUND_OPEN_ERROR', 'event', v_event.id, jsonb_build_object('error', v_msg));
    END;
  END LOOP;

  -- 2. Conclusão/Fechamento automático por horário definido
  FOR v_event IN
    SELECT e.id, e.event_date, e.status, e.group_id, e.opens_at, e.manual_override,
           s.auto_close, s.close_weekday, s.close_time, s.timezone
    FROM public.volleyball_events e
    JOIN public.app_settings s ON s.group_id = e.group_id
    WHERE e.status IN ('open'::public.event_status, 'closed'::public.event_status)
      AND COALESCE(e.manual_override, false) = false
      AND COALESCE(s.auto_close, true) = true
  LOOP
    v_delta := (COALESCE(v_event.close_weekday, EXTRACT(dow FROM v_event.event_date)::int) - EXTRACT(dow FROM v_event.event_date)::int + 7) % 7;
    v_base_date := v_event.event_date + v_delta;
    v_close_at := (v_base_date::text || ' ' || COALESCE(v_event.close_time, '23:59:59'::time)::text)::timestamp
      AT TIME ZONE COALESCE(v_event.timezone, 'America/Sao_Paulo');

    IF v_now >= v_close_at THEN
      UPDATE public.volleyball_events
      SET status = 'completed'::public.event_status
      WHERE id = v_event.id
        AND status IN ('open'::public.event_status, 'closed'::public.event_status)
        AND manual_override = false;

      IF FOUND THEN
        INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
        VALUES (NULL, 'AUTO_ROUND_CLOSE', 'event', v_event.id,
                jsonb_build_object('event_date', v_event.event_date, 'previous_status', v_event.status));
        v_closed_count := v_closed_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- 3. Criação de próximas rodadas para turmas ativas que estejam sem rodada pendente
  FOR v_group IN
    SELECT id FROM public.groups WHERE active = true ORDER BY sort_order, id
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.volleyball_events
      WHERE group_id = v_group.id
        AND status IN ('scheduled'::public.event_status, 'open'::public.event_status, 'closed'::public.event_status)
    ) THEN
      BEGIN
        v_res := public.internal_create_next_event(v_group.id, NULL);
        IF v_res->>'status' = 'created' THEN
          v_created_count := v_created_count + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
        INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
        VALUES (NULL, 'AUTO_ROUND_CREATE_ERROR', 'group', v_group.id, jsonb_build_object('error', v_msg));
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'closed', v_closed_count,
    'opened', v_opened_count,
    'created', v_created_count,
    'executed_at', v_now
  );
END;
$$
;

REVOKE ALL ON FUNCTION public.internal_cycle_rounds() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_cycle_rounds() FROM anon;
REVOKE ALL ON FUNCTION public.internal_cycle_rounds() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_cycle_rounds() TO service_role;

------------------------------------------------------------------------
-- 4. internal_process_due_event_openings: Lock de concorrência
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.internal_process_due_event_openings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('internal_process_due_event_openings')) THEN
    RETURN;
  END IF;

  PERFORM public.internal_cycle_rounds();
END;
$$
;

REVOKE ALL ON FUNCTION public.internal_process_due_event_openings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_process_due_event_openings() FROM anon;
REVOKE ALL ON FUNCTION public.internal_process_due_event_openings() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_process_due_event_openings() TO service_role;

------------------------------------------------------------------------
-- 5. pg_cron: Sincronização segura do agendamento (se extensão existir)
------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    BEGIN
      PERFORM cron.unschedule('round_cycling_job');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule('round_cycling_job', '* * * * *', 'SELECT public.internal_cycle_rounds()');
  END IF;
END;
$$;
