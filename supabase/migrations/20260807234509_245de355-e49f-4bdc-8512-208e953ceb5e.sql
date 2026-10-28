
-- Migração para Autoinscrição de Organizadores
-- Esta migração cria a função idempotente no banco de dados para garantir a inserção dos organizadores com intervalos de 3 segundos.

CREATE OR REPLACE FUNCTION public.admin_ensure_opening_organizers(p_event_id uuid, p_admin_user_id uuid DEFAULT NULL)
RETURNS TABLE(enrolled_count int, already_enrolled_count int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
BEGIN
    -- 1. Travar evento para evitar condições de corrida
    PERFORM public.lock_event(p_event_id);

    -- 2. Carregar dados do evento
    SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
    IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;

    -- Fonte de verdade para abertura: v_event.opens_at ou agora
    v_opening_at := COALESCE(v_event.opens_at, now());
    v_main_limit := v_event.main_limit;

    -- 3. Buscar organizadores da turma configurada no evento
    -- Ordenado estritamente por organizer_order ASC
    FOR v_org IN 
        SELECT pg.player_id, pg.organizer_order, p.name
        FROM public.player_groups pg
        JOIN public.players p ON p.id = pg.player_id
        WHERE pg.group_id = v_event.group_id 
          AND pg.is_organizer = true 
          AND p.active = true
        ORDER BY pg.organizer_order ASC NULLS LAST, p.name ASC
    LOOP
        -- 4. Verificar se já existe inscrição ativa para este jogador neste evento (Idempotência)
        IF EXISTS (
            SELECT 1 FROM public.registrations 
            WHERE event_id = p_event_id 
              AND player_id = v_org.player_id 
              AND cancelled_at IS NULL
        ) THEN
            v_already := v_already + 1;
            CONTINUE;
        END IF;

        -- 5. Calcular timestamp sequencial (+3 segundos por posição na ordem)
        -- organizer_order começa geralmente em 1. Se for NULL ou 0, usamos v_enrolled + v_already como fallback de índice
        v_org_timestamp := v_opening_at + (INTERVAL '3 seconds' * COALESCE(v_org.organizer_order - 1, v_enrolled + v_already));

        -- 6. Determinar lista (Titular ou Reserva) com base no limite
        SELECT count(*) INTO v_current_main 
        FROM public.registrations 
        WHERE event_id = p_event_id AND list_type = 'main' AND cancelled_at IS NULL;

        IF v_current_main < v_main_limit THEN
            v_list := 'main';
            v_pos := v_current_main + 1;
        ELSE
            v_list := 'wait';
            SELECT COALESCE(MAX(position_number), 0) + 1 INTO v_pos 
            FROM public.registrations 
            WHERE event_id = p_event_id AND list_type = 'wait' AND cancelled_at IS NULL;
        END IF;

        -- 7. Inserir inscrição com o timestamp calculado
        -- Usamos override de created_at para garantir a ordem cronológica absoluta na lista
        INSERT INTO public.registrations (
            event_id, 
            player_id, 
            registered_by_player_id, 
            list_type, 
            position_number, 
            registration_source,
            created_at
        )
        VALUES (
            p_event_id, 
            v_org.player_id, 
            COALESCE(p_admin_user_id, v_org.player_id), 
            v_list, 
            v_pos, 
            'admin_sync', -- Identificador de que foi via sistema/admin
            v_org_timestamp
        )
        RETURNING id INTO v_reg_id;

        -- Log de auditoria se houver admin
        IF p_admin_user_id IS NOT NULL THEN
            INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
            VALUES (p_admin_user_id, 'auto_enroll_organizer', 'registration', v_reg_id, 
                jsonb_build_object('event_id', p_event_id, 'player_id', v_org.player_id, 'order', v_org.organizer_order, 'timestamp', v_org_timestamp));
        END IF;

        v_enrolled := v_enrolled + 1;
    END LOOP;

    RETURN QUERY SELECT v_enrolled, v_already;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ensure_opening_organizers(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_ensure_opening_organizers(uuid, uuid) TO service_role;
