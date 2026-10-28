CREATE OR REPLACE FUNCTION public.internal_process_event_opening(p_event_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_event record;
    v_organizer record;
    v_enrolled_count int := 0;
    v_details jsonb := '[]'::jsonb;
    v_base_time timestamptz;
BEGIN
    PERFORM public.lock_event(p_event_id);

    SELECT * INTO v_event 
    FROM public.volleyball_events 
    WHERE id = p_event_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('ok', false, 'message', 'Evento não encontrado');
    END IF;

    IF v_event.status IS DISTINCT FROM 'scheduled' THEN
        RETURN json_build_object('ok', true, 'message', 'Evento já processado ou em outro status', 'status', v_event.status);
    END IF;

    IF v_event.opens_at > now() THEN
        RETURN json_build_object('ok', false, 'message', 'Horário de abertura ainda não chegou');
    END IF;

    v_base_time := v_event.opens_at;

    FOR v_organizer IN
        SELECT pg.player_id, p.name, pg.organizer_order
        FROM public.player_groups pg
        JOIN public.players p ON p.id = pg.player_id
        WHERE pg.group_id = v_event.group_id
          AND pg.is_organizer = true
          AND pg.status = 'approved'
          AND p.active = true
        ORDER BY pg.organizer_order ASC NULLS LAST
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM public.registrations
            WHERE event_id = p_event_id
              AND player_id = v_organizer.player_id
              AND cancelled_at IS NULL
        ) THEN
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
                'main',
                'organizer_auto',
                v_organizer.player_id,
                v_enrolled_count + 1,
                v_base_time + (COALESCE(v_organizer.organizer_order, 99) * interval '1 millisecond')
            );
            
            v_enrolled_count := v_enrolled_count + 1;
            v_details := v_details || jsonb_build_object('player', v_organizer.name, 'status', 'enrolled');
        ELSE
            v_details := v_details || jsonb_build_object('player', v_organizer.name, 'status', 'already_present');
        END IF;
    END LOOP;

    UPDATE public.volleyball_events
    SET status = 'open'::event_status,
        organizers_auto_enrolled_at = now()
    WHERE id = p_event_id;

    RETURN json_build_object(
        'ok', true, 
        'event_id', p_event_id, 
        'enrolled_count', v_enrolled_count,
        'details', v_details
    );
END;
$$;

GRANT ALL ON FUNCTION public.internal_process_event_opening(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.internal_process_event_opening(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.internal_process_due_event_openings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_event_id uuid;
BEGIN
    FOR v_event_id IN
        SELECT id 
        FROM public.volleyball_events 
        WHERE status = 'scheduled' 
          AND opens_at <= now()
        FOR UPDATE SKIP LOCKED
    LOOP
        PERFORM public.internal_process_event_opening(v_event_id);
    END LOOP;
END;
$$;

GRANT ALL ON FUNCTION public.internal_process_due_event_openings() TO authenticated;
GRANT ALL ON FUNCTION public.internal_process_due_event_openings() TO service_role;

CREATE OR REPLACE FUNCTION public.internal_sync_event_status(p_event_id uuid, p_group_id uuid, p_calculated_status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
    IF p_calculated_status = 'open' THEN
        PERFORM public.internal_process_event_opening(p_event_id);
    END IF;
END;
$$;

GRANT ALL ON FUNCTION public.internal_sync_event_status(uuid, uuid, text) TO authenticated;
GRANT ALL ON FUNCTION public.internal_sync_event_status(uuid, uuid, text) TO service_role;

-- Try to schedule cron
SELECT cron.schedule('process_event_openings', '* * * * *', 'SELECT public.internal_process_due_event_openings()');
