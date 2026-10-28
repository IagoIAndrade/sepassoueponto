
CREATE OR REPLACE FUNCTION public.internal_leave_registration_v3(
    p_registration_id uuid, 
    p_player_id uuid, 
    p_confirm_late_leave boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_reg public.registrations;
    v_event public.volleyball_events;
    v_settings public.app_settings;
    v_now timestamp;
    v_deadline_timestamp timestamp;
    v_is_late boolean;
    v_next_wait_id uuid;
    v_penalty_rounds integer;
BEGIN
    SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id FOR UPDATE;

    IF v_reg.id IS NULL THEN
        RETURN json_build_object('ok', false, 'error', 'Inscrição não encontrada');
    END IF;

    IF v_reg.player_id != p_player_id AND v_reg.registered_by_player_id != p_player_id THEN
        RETURN json_build_object('ok', false, 'error', 'Não autorizado');
    END IF;

    IF v_reg.cancelled_at IS NOT NULL THEN
        RETURN json_build_object('ok', true);
    END IF;

    PERFORM public.lock_event(v_reg.event_id);

    SELECT * INTO v_event FROM public.volleyball_events WHERE id = v_reg.event_id;
    SELECT * INTO v_settings FROM public.app_settings WHERE group_id = v_event.group_id;
    
    v_now := now() AT TIME ZONE (COALESCE(v_settings.timezone, 'America/Sao_Paulo'));
    v_deadline_timestamp := (v_event.event_date + v_settings.withdrawal_deadline_time)::timestamp;

    IF v_settings.withdrawal_deadline_weekday IS NOT NULL THEN
        DECLARE
            v_event_dow int := extract(dow from v_event.event_date);
            v_diff int := v_event_dow - v_settings.withdrawal_deadline_weekday;
        BEGIN
            IF v_diff < 0 THEN v_diff := v_diff + 7; END IF;
            v_deadline_timestamp := v_deadline_timestamp - (v_diff || ' days')::interval;
        END;
    END IF;

    v_is_late := v_now > v_deadline_timestamp;
    v_penalty_rounds := COALESCE(v_settings.penalty_late_leave, 2);

    IF v_is_late AND NOT p_confirm_late_leave THEN
        RETURN json_build_object(
            'status', 'late_leave_confirmation_required',
            'deadline_at', v_deadline_timestamp,
            'penalty_late_leave', v_penalty_rounds,
            'timezone', COALESCE(v_settings.timezone, 'America/Sao_Paulo')
        );
    END IF;

    UPDATE public.registrations 
    SET cancelled_at = now(),
        cancelled_by_player_id = p_player_id
    WHERE id = p_registration_id;

    IF v_is_late THEN
        INSERT INTO public.player_incidents (
            event_id, player_id, group_id, incident_type, occurred_at, suggested_rounds, status, justification, scope
        ) VALUES (
            v_reg.event_id, v_reg.player_id, v_event.group_id, 'late_leave', now(), v_penalty_rounds, 'pending',
            'Saída confirmada após o prazo de ' || to_char(v_deadline_timestamp, 'DD/MM HH24:MI'), 'group'
        );
    END IF;

    IF v_reg.list_type = 'main' AND COALESCE(v_settings.auto_promote_reservations, true) THEN
        SELECT id INTO v_next_wait_id
        FROM public.registrations
        WHERE event_id = v_reg.event_id
          AND cancelled_at IS NULL
          AND list_type = 'wait'
        ORDER BY position_number ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_next_wait_id IS NOT NULL THEN
            UPDATE public.registrations
            SET list_type = 'main',
                position_number = (
                    SELECT COALESCE(max(position_number), 0) + 1 
                    FROM public.registrations 
                    WHERE event_id = v_reg.event_id AND list_type = 'main' AND cancelled_at IS NULL
                )
            WHERE id = v_next_wait_id;
        END IF;
    END IF;

    UPDATE public.registrations
    SET position_number = position_number - 1
    WHERE event_id = v_reg.event_id
      AND list_type = v_reg.list_type
      AND cancelled_at IS NULL
      AND position_number > v_reg.position_number;

    RETURN json_build_object('ok', true, 'is_late', v_is_late);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v3(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v3(uuid, uuid, boolean) TO service_role;
