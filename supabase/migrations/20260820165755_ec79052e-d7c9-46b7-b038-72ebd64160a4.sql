-- 1. Refatorar internal_is_blocked para suportar scope e group_id corretamente
CREATE OR REPLACE FUNCTION public.internal_is_blocked(p_player_id uuid, p_event_date date, p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.player_blocks b
    WHERE b.player_id = p_player_id
      AND b.active = true
      AND p_event_date BETWEEN b.starts_at AND b.ends_at
      AND (
        b.scope = 'global' 
        OR (b.scope = 'group' AND b.group_id = p_group_id)
      )
  )
$function$;

-- 2. Atualizar internal_join_event com bloqueio de reentrada por late_leave
CREATE OR REPLACE FUNCTION public.internal_join_event(p_event_id uuid, p_target_player_id uuid, p_responsible_player_id uuid, p_force_override boolean DEFAULT false)
 RETURNS TABLE(out_registration_id uuid, out_list_type list_type, out_position_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event public.volleyball_events;
  v_target public.players;
  v_resp_cnt int; v_main_cnt int; v_pos int;
  v_list public.list_type; v_reg_id uuid;
  v_blocked boolean; v_priority_end timestamptz;
  v_paid_up boolean; v_priority_minutes int;
  v_event_name text;
BEGIN
  PERFORM public.lock_event(p_event_id);
  
  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF v_event.status <> 'open' THEN RAISE EXCEPTION 'event_not_open'; END IF;

  IF v_event.opens_at IS NULL OR v_event.opens_at > now() THEN
    UPDATE public.volleyball_events SET opens_at = now() WHERE id = p_event_id;
    SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  END IF;

  SELECT * INTO v_target FROM public.players WHERE id = p_target_player_id;
  IF v_target.id IS NULL OR NOT v_target.active THEN RAISE EXCEPTION 'player_not_available'; END IF;

  -- BLOQUEIO DE REENTRADA: Mesma rodada após late_leave
  IF EXISTS (
      SELECT 1 FROM public.player_incidents 
      WHERE player_id = p_target_player_id 
        AND event_id = p_event_id 
        AND incident_type = 'late_leave' 
        AND status NOT IN ('cancelled', 'justified')
  ) AND NOT p_force_override THEN
      RAISE EXCEPTION 'late_leave_rejoin_forbidden';
  END IF;

  v_blocked := public.internal_is_blocked(p_target_player_id, v_event.event_date, v_event.group_id);
  IF v_blocked AND NOT p_force_override THEN RAISE EXCEPTION 'player_blocked'; END IF;

  IF EXISTS (SELECT 1 FROM public.registrations r
             WHERE r.event_id = p_event_id AND r.player_id = p_target_player_id AND r.cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'already_registered';
  END IF;

  v_priority_minutes := v_event.priority_minutes;
  IF v_priority_minutes IS NULL THEN
    SELECT priority_minutes INTO v_priority_minutes FROM public.app_settings WHERE group_id = v_event.group_id;
  END IF;
  v_priority_minutes := COALESCE(v_priority_minutes, 0);
  
  v_priority_end := v_event.opens_at + (v_priority_minutes * interval '1 minute');
  v_paid_up := public.player_is_paid_up(p_target_player_id, v_event.group_id);

  SELECT count(*)::int INTO v_main_cnt FROM public.registrations
  WHERE event_id = p_event_id AND list_type = 'main' AND cancelled_at IS NULL;

  IF v_main_cnt < v_event.main_limit THEN
    IF now() > v_priority_end OR v_paid_up THEN
      v_list := 'main';
    ELSE
      v_list := 'wait';
    END IF;
  ELSE
    v_list := 'wait';
  END IF;

  SELECT COALESCE(max(position_number), 0) + 1 INTO v_pos
  FROM public.registrations
  WHERE event_id = p_event_id AND list_type = v_list AND cancelled_at IS NULL;

  INSERT INTO public.registrations (
    event_id, player_id, list_type, position_number, registered_by_player_id
  ) VALUES (
    p_event_id, p_target_player_id, v_list, v_pos, p_responsible_player_id
  ) RETURNING id INTO v_reg_id;

  SELECT g.name INTO v_event_name FROM public.groups g WHERE g.id = v_event.group_id;
  
  IF v_list = 'main' THEN
    INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
    VALUES (
      p_target_player_id, 'registration_confirmed', v_event.group_id, p_event_id, 
      jsonb_build_object('message', 'Você entrou na Lista Principal de ' || v_event_name || '.'),
      'reg-conf-' || p_target_player_id || '-' || p_event_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  ELSE
    INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
    VALUES (
      p_target_player_id, 'waitlist_joined', v_event.group_id, p_event_id, 
      jsonb_build_object('message', 'No momento você está em ' || v_pos || 'º lugar na fila de espera de ' || v_event_name || '.'),
      'reg-wait-' || p_target_player_id || '-' || p_event_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_reg_id, v_list, v_pos;
END;
$function$;

-- 3. Atualizar admin_add_player
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

  -- BLOQUEIO DE REENTRADA: Mesma rodada após late_leave
  IF EXISTS (
      SELECT 1 FROM public.player_incidents 
      WHERE player_id = p_target_player_id 
        AND event_id = p_event_id 
        AND incident_type = 'late_leave' 
        AND status NOT IN ('cancelled', 'justified')
  ) AND NOT p_force_override THEN
      RAISE EXCEPTION 'late_leave_rejoin_forbidden';
  END IF;

  IF EXISTS (SELECT 1 FROM public.registrations r
             WHERE r.event_id = p_event_id AND r.player_id = p_target_player_id AND r.cancelled_at IS NULL)
  THEN RAISE EXCEPTION 'already_registered'; END IF;

  v_blocked := public.internal_is_blocked(p_target_player_id, v_event.event_date, v_event.group_id);
  IF v_blocked AND NOT p_force_override THEN RAISE EXCEPTION 'player_blocked'; END IF;

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

-- 4. Refatorar internal_leave_registration_v3 para cálculo de penalidade por RODADA
CREATE OR REPLACE FUNCTION public.internal_leave_registration_v3(p_registration_id uuid, p_player_id uuid, p_confirm_late_leave boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_reg record;
    v_event record;
    v_settings record;
    v_deadline_ts timestamptz;
    v_is_late boolean;
    v_promoted_reg_id uuid;
    v_next_reg record;
    v_next_pos int;
    v_incident_id uuid;
    v_target_date date;
    v_loop_date date;
    v_i int;
    v_penalty_rounds int;
BEGIN
    SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id AND player_id = p_player_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found'; END IF;
    
    IF v_reg.cancelled_at IS NOT NULL THEN 
        RETURN jsonb_build_object('status', 'already_cancelled', 'ok', true); 
    END IF;

    SELECT * INTO v_event FROM public.volleyball_events WHERE id = v_reg.event_id;
    SELECT * INTO v_settings FROM public.app_settings WHERE group_id = v_event.group_id;

    v_deadline_ts := (
        (v_event.event_date - ((EXTRACT(DOW FROM v_event.event_date)::int - v_settings.withdrawal_deadline_weekday + 7) % 7))::timestamp 
        + v_settings.withdrawal_deadline_time
    ) AT TIME ZONE v_settings.timezone;

    v_is_late := now() > v_deadline_ts;
    v_penalty_rounds := COALESCE(v_settings.penalty_late_leave, 2);

    IF v_is_late AND NOT p_confirm_late_leave THEN
        RETURN jsonb_build_object(
            'status', 'late_leave_confirmation_required',
            'ok', false,
            'deadline_at', v_deadline_ts,
            'penalty_late_leave', v_penalty_rounds,
            'timezone', v_settings.timezone
        );
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_reg.event_id::text, 42));

    UPDATE public.registrations 
    SET cancelled_at = now(), 
        cancelled_by_player_id = p_player_id, 
        cancelled_by_admin_user_id = NULL 
    WHERE id = p_registration_id;

    IF v_is_late THEN
        INSERT INTO public.player_incidents (
            player_id, event_id, group_id, 
            incident_type, occurred_at, 
            suggested_rounds, status, 
            justification, scope
        )
        VALUES (
            p_player_id, v_reg.event_id, v_event.group_id,
            'late_leave', now(),
            v_penalty_rounds, 'pending',
            'Saída confirmada após o prazo', 'group'
        )
        ON CONFLICT (player_id, event_id, incident_type) DO UPDATE SET occurred_at = now()
        RETURNING id INTO v_incident_id;

        IF v_penalty_rounds > 0 THEN
            v_i := 0;
            v_loop_date := v_event.event_date;
            
            WHILE v_i < v_penalty_rounds LOOP
                -- Tenta encontrar a próxima rodada já agendada
                SELECT event_date INTO v_target_date 
                FROM public.volleyball_events 
                WHERE group_id = v_event.group_id 
                  AND event_date > v_loop_date 
                  AND status NOT IN ('completed', 'cancelled')
                ORDER BY event_date ASC LIMIT 1;

                IF NOT FOUND THEN
                    -- Se não houver rodada agendada, calcula a data teórica (baseada na periodicidade semanal da turma)
                    v_target_date := v_loop_date + interval '7 days';
                END IF;

                INSERT INTO public.player_blocks (
                    player_id, group_id,
                    starts_at, ends_at, reason, active, scope
                ) VALUES (
                    p_player_id, v_event.group_id,
                    v_target_date, v_target_date, -- Bloqueia a rodada específica
                    'Saída tardia da rodada ' || v_event.event_date,
                    true, 'group'
                );

                v_loop_date := v_target_date;
                v_i := v_i + 1;
            END LOOP;
        END IF;
    END IF;

    RETURN jsonb_build_object('status', 'success', 'ok', true);
END;
$function$;
