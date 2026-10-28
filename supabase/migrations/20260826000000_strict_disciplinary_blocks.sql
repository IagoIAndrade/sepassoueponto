-- Implementa bloqueio disciplinar real com mensagem estruturada (Você está bloqueado nesta turma por mais X rodada(s))
-- Aplica nas RPCs oficiais e como trigger atômica antes do INSERT em registrations.

CREATE OR REPLACE FUNCTION public.internal_validate_disciplinary_status(p_player_id uuid, p_group_id uuid, p_event_id uuid, p_force_override boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_event record;
    v_incident record;
    v_rounds_passed integer;
    v_rounds_remaining integer;
    v_total_remaining integer := 0;
    v_blocks_count integer;
    v_is_guest boolean;
BEGIN
    SELECT COALESCE(is_guest, false) INTO v_is_guest FROM public.players WHERE id = p_player_id;
    IF v_is_guest THEN
        RETURN;
    END IF;

    SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
    IF NOT FOUND THEN RETURN; END IF;

    -- Lógica 1: Olhar player_incidents 'active', 'ACTIVE', 'applied', 'APPLIED'
    FOR v_incident IN
        SELECT * FROM public.player_incidents
        WHERE player_id = p_player_id
          AND group_id = p_group_id
          AND status IN ('active', 'ACTIVE', 'applied', 'APPLIED')
    LOOP
        SELECT COUNT(*)
        INTO v_rounds_passed
        FROM public.volleyball_events
        WHERE group_id = p_group_id
          AND event_date > v_incident.occurred_at::date
          AND event_date <= v_event.event_date
          AND status NOT IN ('cancelled');

        v_rounds_remaining := COALESCE(v_incident.applied_rounds, v_incident.suggested_rounds, 0) - v_rounds_passed;
        IF v_rounds_remaining > 0 THEN
            v_total_remaining := v_total_remaining + v_rounds_remaining;
        END IF;
    END LOOP;

    -- Lógica 2: Olhar player_blocks ativos
    SELECT COUNT(DISTINCT e.id)
    INTO v_blocks_count
    FROM public.player_blocks b
    JOIN public.volleyball_events e 
      ON e.event_date >= v_event.event_date 
      AND e.event_date BETWEEN b.starts_at AND b.ends_at
      AND (b.scope = 'global' OR e.group_id = b.group_id)
    WHERE b.player_id = p_player_id
      AND b.active = true
      AND (b.scope = 'global' OR b.group_id = p_group_id)
      AND e.status NOT IN ('cancelled');
      
    IF v_blocks_count > v_total_remaining THEN
        v_total_remaining := v_blocks_count;
    END IF;

    IF v_total_remaining > 0 AND NOT p_force_override THEN
        RAISE EXCEPTION 'Você está bloqueado nesta turma por mais % rodada(s).', v_total_remaining;
    END IF;

    IF v_total_remaining = 0 AND NOT p_force_override THEN
        IF EXISTS (
            SELECT 1 FROM public.player_blocks b
            WHERE b.player_id = p_player_id
              AND b.active = true
              AND v_event.event_date BETWEEN b.starts_at AND b.ends_at
              AND (b.scope = 'global' OR b.group_id = p_group_id)
        ) THEN
            RAISE EXCEPTION 'Você está bloqueado nesta turma por mais 1 rodada(s).';
        END IF;
    END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_trigger_verify_disciplinary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_event record;
    v_force boolean := false;
BEGIN
    IF NEW.cancelled_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_event FROM public.volleyball_events WHERE id = NEW.event_id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    IF current_setting('role', true) = 'service_role' OR current_user = 'postgres' THEN
       v_force := true;
    END IF;

    IF NEW.registration_source IN ('admin', 'admin_sync') THEN
        v_force := true;
    END IF;

    PERFORM public.internal_validate_disciplinary_status(NEW.player_id, v_event.group_id, NEW.event_id, v_force);

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS tr_disciplinary_protection ON public.registrations;

CREATE TRIGGER tr_disciplinary_protection
BEFORE INSERT ON public.registrations
FOR EACH ROW
EXECUTE FUNCTION public.fn_trigger_verify_disciplinary();

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
        AND status NOT IN ('cancelled', 'justified', 'RESOLVED', 'PERDOADA')
  ) AND NOT p_force_override THEN
      RAISE EXCEPTION 'late_leave_rejoin_forbidden';
  END IF;

  -- Bloqueio disciplinar completo
  PERFORM public.internal_validate_disciplinary_status(p_target_player_id, v_event.group_id, p_event_id, p_force_override);

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
        AND status NOT IN ('cancelled', 'justified', 'RESOLVED', 'PERDOADA')
  ) AND NOT p_force_override THEN
      RAISE EXCEPTION 'late_leave_rejoin_forbidden';
  END IF;

  -- Bloqueio disciplinar completo
  PERFORM public.internal_validate_disciplinary_status(p_target_player_id, v_event.group_id, p_event_id, p_force_override);

  IF EXISTS (SELECT 1 FROM public.registrations r
             WHERE r.event_id = p_event_id AND r.player_id = p_target_player_id AND r.cancelled_at IS NULL)
  THEN RAISE EXCEPTION 'already_registered'; END IF;

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

CREATE OR REPLACE FUNCTION public.admin_add_player(p_event_id uuid, p_target_player_id uuid, p_list_type list_type, p_admin_user_id uuid, p_force_override boolean DEFAULT false)
 RETURNS TABLE(out_registration_id uuid, out_list_type list_type, out_position_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_event public.volleyball_events; v_pos int; v_reg uuid; v_main_cnt int;
BEGIN
  PERFORM public.lock_event(p_event_id);
  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_target_player_id AND active) THEN
    RAISE EXCEPTION 'player_not_available'; END IF;
    
  IF EXISTS (SELECT 1 FROM public.player_incidents WHERE player_id = p_target_player_id AND event_id = p_event_id AND incident_type = 'late_leave' AND status NOT IN ('cancelled', 'justified', 'RESOLVED', 'PERDOADA')) AND NOT p_force_override THEN
      RAISE EXCEPTION 'late_leave_rejoin_forbidden';
  END IF;

  PERFORM public.internal_validate_disciplinary_status(p_target_player_id, v_event.group_id, p_event_id, p_force_override);

  IF EXISTS (SELECT 1 FROM public.registrations r WHERE r.event_id = p_event_id AND r.player_id = p_target_player_id AND r.cancelled_at IS NULL) THEN RAISE EXCEPTION 'already_registered'; END IF;

  IF p_list_type = 'main' THEN
    SELECT count(*) INTO v_main_cnt FROM public.registrations r WHERE r.event_id = p_event_id AND r.list_type='main' AND r.cancelled_at IS NULL;
    IF v_main_cnt >= v_event.main_limit THEN RAISE EXCEPTION 'main_full'; END IF;
    v_pos := v_main_cnt + 1;
  ELSE
    SELECT coalesce(max(r.position_number),0)+1 INTO v_pos FROM public.registrations r WHERE r.event_id = p_event_id AND r.list_type='wait' AND r.cancelled_at IS NULL;
  END IF;

  INSERT INTO public.registrations (event_id, player_id, registered_by_player_id, list_type, position_number, registration_source)
  VALUES (p_event_id, p_target_player_id, p_target_player_id, p_list_type, v_pos, 'admin')
  RETURNING id INTO v_reg;

  INSERT INTO public.player_groups (player_id, group_id) VALUES (p_target_player_id, v_event.group_id) ON CONFLICT DO NOTHING;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id,'admin_add_player','registration', v_reg, jsonb_build_object('event_id', p_event_id,'player_id', p_target_player_id,'list_type', p_list_type,'force', p_force_override,'group_id', v_event.group_id));
  out_registration_id := v_reg; out_list_type := p_list_type; out_position_number := v_pos; RETURN NEXT;
END; $function$;
