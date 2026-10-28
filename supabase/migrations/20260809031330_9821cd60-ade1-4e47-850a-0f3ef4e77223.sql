DROP FUNCTION IF EXISTS public.admin_ensure_opening_organizers(uuid, uuid);

CREATE OR REPLACE FUNCTION public.admin_ensure_opening_organizers(p_event_id uuid, p_admin_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(enrolled_count integer, already_enrolled_count integer, details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_event record;
    v_org record;
    v_opening_at timestamptz;
    v_enrolled int := 0;
    v_already int := 0;
    v_org_timestamp timestamptz;
    v_main_limit int;
    v_current_main int;
    v_list public.list_type;
    v_pos int;
    v_reg_id uuid;
    v_details jsonb := '[]'::jsonb;
BEGIN
    -- 1. Travar evento
    PERFORM public.lock_event(p_event_id);

    -- 2. Carregar dados do evento
    SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
    IF v_event.id IS NULL THEN 
        RAISE EXCEPTION 'Event not found with ID %', p_event_id; 
    END IF;

    v_opening_at := COALESCE(v_event.opens_at, now());
    v_main_limit := v_event.main_limit;

    -- 3. Buscar organizadores da turma configurada no evento
    FOR v_org IN
        SELECT pg.player_id, pg.organizer_order, p.name
        FROM public.player_groups pg
        JOIN public.players p ON p.id = pg.player_id
        WHERE pg.group_id = v_event.group_id
          AND pg.is_organizer = true
          AND p.active = true
        ORDER BY pg.organizer_order ASC NULLS LAST, p.name ASC
    LOOP
        -- 4. Verificar se já existe (Idempotência)
        IF EXISTS (
            SELECT 1 FROM public.registrations
            WHERE event_id = p_event_id
              AND player_id = v_org.player_id
              AND cancelled_at IS NULL
        ) THEN
            v_already := v_already + 1;
            v_details := v_details || jsonb_build_object('player', v_org.name, 'status', 'already_enrolled');
            CONTINUE;
        END IF;

        -- 5. Calcular timestamp sequencial
        v_org_timestamp := v_opening_at + (INTERVAL '3 seconds' * COALESCE(v_org.organizer_order - 1, v_enrolled + v_already));

        -- 6. Determinar lista e posição
        SELECT count(*) INTO v_current_main
        FROM public.registrations
        WHERE event_id = p_event_id AND list_type = 'main' AND cancelled_at IS NULL;

        IF v_current_main < v_main_limit THEN
            v_list := 'main';
            v_pos := v_current_main + 1;
        ELSE
            v_list := 'waitlist';
            SELECT COALESCE(max(position_number), 0) + 1 INTO v_pos
            FROM public.registrations
            WHERE event_id = p_event_id AND list_type = 'waitlist' AND cancelled_at IS NULL;
        END IF;

        -- 7. Inserir
        INSERT INTO public.registrations (
            event_id,
            player_id,
            registered_by_player_id,
            list_type,
            position_number,
            created_at,
            registration_source
        ) VALUES (
            p_event_id,
            v_org.player_id,
            COALESCE(p_admin_user_id, v_org.player_id),
            v_list,
            v_pos,
            v_org_timestamp,
            'admin_sync'
        ) RETURNING id INTO v_reg_id;

        v_enrolled := v_enrolled + 1;
        v_details := v_details || jsonb_build_object('player', v_org.name, 'status', 'enrolled', 'id', v_reg_id);
    END LOOP;

    -- Registrar o processamento no evento
    UPDATE public.volleyball_events SET organizers_auto_enrolled_at = now() WHERE id = p_event_id;

    RETURN QUERY SELECT v_enrolled, v_already, v_details;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ensure_opening_organizers(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ensure_opening_organizers(uuid, uuid) TO service_role;
