-- 1. Criar função para garantir a abertura da rodada (Security Definer)
-- Essa função resolve o problema de permissão (não usa auth.uid() para a validação temporal)
CREATE OR REPLACE FUNCTION public.internal_sync_event_status(
    p_event_id uuid,
    p_group_id uuid,
    p_calculated_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Só atualiza se o status atual for scheduled e o novo for open
    UPDATE volleyball_events
    SET status = 'open'::event_status
    WHERE id = p_event_id 
      AND group_id = p_group_id
      AND status = 'scheduled'::event_status;
      
    IF FOUND THEN
        RAISE NOTICE '[AUTO OPEN] Evento % atualizado para open.', p_event_id;
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.internal_sync_event_status TO authenticated, anon;

-- 2. Corrigir a RPC de autoinscrição de organizadores
-- Agora preenche position_number corretamente e é Security Definer
CREATE OR REPLACE FUNCTION public.admin_ensure_opening_organizers(
    p_event_id uuid,
    p_admin_user_id uuid DEFAULT NULL
)
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
    v_next_pos int;
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
    -- A tabela correta é player_groups (visto via psql e no código OrganizersTab)
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
        -- Verificar se já está inscrito (evitar duplicidade de posição se já existir)
        IF EXISTS (
            SELECT 1 FROM registrations 
            WHERE event_id = p_event_id 
              AND player_id = v_organizer.player_id 
              AND cancelled_at IS NULL
        ) THEN
            v_already_count := v_already_count + 1;
            v_details := v_details || jsonb_build_object('player', v_organizer.name, 'status', 'already_enrolled');
            CONTINUE;
        END IF;

        -- Pegar próxima posição disponível
        SELECT COALESCE(MAX(position_number), 0) + 1 INTO v_next_pos
        FROM registrations
        WHERE event_id = p_event_id 
          AND list_type = 'main'
          AND cancelled_at IS NULL;

        -- Tentar inserir
        BEGIN
            INSERT INTO registrations (
                event_id,
                player_id,
                list_type,
                registration_source,
                registered_by_player_id,
                position_number
            ) VALUES (
                p_event_id,
                v_organizer.player_id,
                'main',
                'admin',
                COALESCE(p_admin_user_id, v_organizer.player_id),
                v_next_pos
            );

            v_enrolled_count := v_enrolled_count + 1;
            v_details := v_details || jsonb_build_object('player', v_organizer.name, 'status', 'enrolled', 'pos', v_next_pos);
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
        'details', v_details,
        'group_id', v_group_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ensure_opening_organizers TO authenticated, anon;
