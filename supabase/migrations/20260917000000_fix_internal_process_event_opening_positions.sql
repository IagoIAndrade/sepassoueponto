-- Correção atômica e idempotente da inscrição automática de organizadores
-- Elimina colisão no índice uq_reg_position_active calculando próxima posição livre real por list_type
-- Corrige enum list_type ('main' e 'wait', eliminando 'waitlist' inválido)
-- Respeita capacidade de titulares e reservas sem reorganizar rodadas abertas

CREATE OR REPLACE FUNCTION public.internal_process_event_opening(p_event_id uuid, p_force boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_event record;
    v_settings record;
    v_organizer record;
    v_enrolled_count int := 0;
    v_already_count int := 0;
    v_details jsonb := '[]'::jsonb;
    v_base_time timestamptz;
    v_target_list public.list_type;
    v_current_main int;
    v_current_wait int;
    v_main_limit int;
    v_wait_limit int;
    v_next_pos int;
    v_is_blocked boolean;
BEGIN
    -- 1. Lock determinístico do evento
    PERFORM public.lock_event(p_event_id);

    SELECT * INTO v_event 
    FROM public.volleyball_events 
    WHERE id = p_event_id 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN json_build_object('ok', false, 'message', 'Evento não encontrado');
    END IF;

    -- 2. Verificação de status e horário (respeita p_force para reprocessamento administrativo)
    IF NOT p_force THEN
        IF v_event.status IS DISTINCT FROM 'scheduled'::public.event_status THEN
            RETURN json_build_object(
                'ok', true, 
                'message', 'Evento já processado ou em outro status', 
                'status', v_event.status
            );
        END IF;

        IF v_event.opens_at > now() THEN
            RETURN json_build_object('ok', false, 'message', 'Horário de abertura ainda não chegou');
        END IF;
    END IF;

    -- 3. Lock concorrente nas inscrições existentes do evento
    PERFORM 1 
    FROM public.registrations 
    WHERE event_id = p_event_id 
    FOR UPDATE;

    SELECT * INTO v_settings
    FROM public.app_settings
    WHERE group_id = v_event.group_id
    LIMIT 1;

    v_base_time := COALESCE(v_event.opens_at, now());
    v_main_limit := COALESCE(v_event.main_limit, v_settings.main_limit, 18);
    
    -- Inspeciona limite de reservas sem presumir existência estática de coluna max_waitlist
    v_wait_limit := COALESCE(
        (to_jsonb(v_settings)->>'max_waitlist')::int,
        (to_jsonb(v_settings)->>'waitlist_limit')::int,
        NULL
    );

    -- 4. Processa organizadores aprovados e ativos na ordem de prioridade definida isolados pelo group_id
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
        -- 5. Validação disciplinar isolada da turma
        v_is_blocked := public.internal_is_blocked(v_organizer.player_id, v_event.event_date, v_event.group_id);
        IF COALESCE(v_is_blocked, false) THEN
            v_details := v_details || jsonb_build_object(
                'player_id', v_organizer.player_id,
                'player', v_organizer.name,
                'status', 'blocked'
            );
            CONTINUE;
        END IF;

        -- 6. Idempotência: pula se organizador já possui inscrição ativa
        IF EXISTS (
            SELECT 1 FROM public.registrations
            WHERE event_id = p_event_id
              AND player_id = v_organizer.player_id
              AND cancelled_at IS NULL
        ) THEN
            v_already_count := v_already_count + 1;
            v_details := v_details || jsonb_build_object(
                'player_id', v_organizer.player_id,
                'player', v_organizer.name, 
                'status', 'already_present'
            );
            CONTINUE;
        END IF;

        -- 7. Capacidade e próxima posição livre real (enum 'main' ou 'wait')
        SELECT count(*)::int INTO v_current_main
        FROM public.registrations
        WHERE event_id = p_event_id
          AND list_type = 'main'::public.list_type
          AND cancelled_at IS NULL;

        IF v_current_main < v_main_limit THEN
            v_target_list := 'main'::public.list_type;
        ELSE
            -- Verifica limite de reservas caso configurado
            SELECT count(*)::int INTO v_current_wait
            FROM public.registrations
            WHERE event_id = p_event_id
              AND list_type = 'wait'::public.list_type
              AND cancelled_at IS NULL;

            IF v_wait_limit IS NOT NULL AND v_current_wait >= v_wait_limit THEN
                v_details := v_details || jsonb_build_object(
                    'player_id', v_organizer.player_id,
                    'player', v_organizer.name,
                    'status', 'waitlist_full'
                );
                CONTINUE;
            END IF;

            v_target_list := 'wait'::public.list_type;
        END IF;

        SELECT COALESCE(max(position_number), 0) + 1
        INTO v_next_pos
        FROM public.registrations
        WHERE event_id = p_event_id
          AND list_type = v_target_list
          AND cancelled_at IS NULL;

        -- 8. Inserção preservando ordem de prioridade
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
    END LOOP;

    -- 9. Atualiza status do evento e timestamp de autoinscrição sem alterar rodadas já abertas
    UPDATE public.volleyball_events
    SET status = CASE WHEN status = 'scheduled'::public.event_status THEN 'open'::public.event_status ELSE status END,
        organizers_auto_enrolled_at = COALESCE(organizers_auto_enrolled_at, now())
    WHERE id = p_event_id;

    RETURN json_build_object(
        'ok', true, 
        'event_id', p_event_id, 
        'enrolled_count', v_enrolled_count,
        'already_count', v_already_count,
        'details', v_details
    );
END;
$$;

-- Wrapper compatível com assinatura legada (uuid)
CREATE OR REPLACE FUNCTION public.internal_process_event_opening(p_event_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    RETURN public.internal_process_event_opening(p_event_id, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.internal_process_event_opening(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_process_event_opening(uuid) TO service_role;
