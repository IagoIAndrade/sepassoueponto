DROP FUNCTION IF EXISTS public.admin_ensure_opening_organizers(uuid, uuid);

CREATE OR REPLACE FUNCTION public.admin_ensure_opening_organizers(p_event_id uuid, p_admin_user_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_group_id uuid;
    v_organizer record;
    v_enrolled_count int := 0;
    v_already_count int := 0;
    v_details jsonb := '[]'::jsonb;
    v_event_status text;
BEGIN
    -- Bloqueio preventivo da rodada para evitar concorrência
    SELECT group_id, status::text INTO v_group_id, v_event_status 
    FROM volleyball_events 
    WHERE id = p_event_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('ok', false, 'message', 'Evento não encontrado');
    END IF;

    -- Buscar organizadores aprovados para este grupo
    FOR v_organizer IN 
        SELECT pg.player_id, p.name
        FROM player_groups pg
        JOIN players p ON p.id = pg.player_id
        WHERE pg.group_id = v_group_id 
          AND pg.is_organizer = true 
          AND pg.status = 'approved'
          AND p.active = true
        ORDER BY pg.organizer_order ASC NULLS LAST
    LOOP
        -- Tentar inserir com tratamento de conflito (idempotência)
        BEGIN
            INSERT INTO registrations (
                event_id, 
                player_id, 
                list_type, 
                registration_source, 
                registered_by_player_id
            ) VALUES (
                p_event_id, 
                v_organizer.player_id, 
                'main', 
                'admin', 
                COALESCE(p_admin_user_id, v_organizer.player_id)
            )
            ON CONFLICT (event_id, player_id) WHERE cancelled_at IS NULL 
            DO NOTHING;

            IF FOUND THEN
                v_enrolled_count := v_enrolled_count + 1;
                v_details := v_details || jsonb_build_object('player', v_organizer.name, 'status', 'enrolled');
            ELSE
                v_already_count := v_already_count + 1;
                v_details := v_details || jsonb_build_object('player', v_organizer.name, 'status', 'already_enrolled');
            END IF;
        EXCEPTION WHEN OTHERS THEN
            v_details := v_details || jsonb_build_object(
                'player', v_organizer.name, 
                'status', 'error', 
                'error', SQLERRM
            );
        END;
    END LOOP;

    RETURN json_build_object(
        'ok', true, 
        'enrolled_count', v_enrolled_count, 
        'already_enrolled_count', v_already_count,
        'details', v_details
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ensure_opening_organizers(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ensure_opening_organizers(uuid, uuid) TO service_role;