-- Migration: Evitar que jogadores comuns inscrevam outros jogadores cadastrados diretamente
-- e garantir validações de limite de convidados

CREATE OR REPLACE FUNCTION admin_add_player(
    p_event_id UUID,
    p_target_player_id UUID,
    p_list_type TEXT,
    p_admin_user_id UUID,
    p_force_override BOOLEAN,
    p_registration_source TEXT DEFAULT 'admin'
) RETURNS JSONB AS $$
DECLARE
    v_event_status TEXT;
    v_group_id UUID;
    v_has_access BOOLEAN;
    v_current_count INTEGER;
    v_limit INTEGER;
    v_assigned_position INTEGER;
    v_caller_role TEXT;
    v_caller_uid UUID;
BEGIN
    -- Validar quem está chamando se for uma requisição client (anon/authenticated)
    v_caller_uid := auth.uid();
    
    IF v_caller_uid IS NOT NULL THEN
        -- Check if caller is admin
        v_caller_role := (SELECT role FROM players WHERE id = v_caller_uid);
        
        -- If it's a regular player trying to register someone else
        IF v_caller_role IS DISTINCT FROM 'admin' THEN
            -- Se for o próprio player chamando admin_add_player, barramos. Ações próprias usam internal_join_event_v3
            RAISE EXCEPTION 'Ação administrativa permitida apenas pelo Painel ADM. Jogadores comuns não podem inscrever outros jogadores cadastrados.';
        END IF;
    END IF;

    -- Localizar evento
    SELECT status, group_id, main_limit INTO v_event_status, v_group_id, v_limit
    FROM volleyball_events WHERE id = p_event_id;

    IF v_event_status IS NULL THEN
        RAISE EXCEPTION 'Evento não encontrado.';
    END IF;

    -- Determinar se tem acesso a turma
    SELECT approved INTO v_has_access
    FROM player_groups
    WHERE player_id = p_target_player_id AND group_id = v_group_id;

    IF NOT p_force_override AND v_has_access IS NOT TRUE THEN
        RAISE EXCEPTION 'Jogador não possui acesso aprovado nesta turma.';
    END IF;

    -- Concorrência e posição
    PERFORM 1 FROM registrations WHERE event_id = p_event_id FOR UPDATE;

    SELECT COUNT(*) INTO v_current_count
    FROM registrations
    WHERE event_id = p_event_id AND status != 'cancelled';

    v_assigned_position := v_current_count + 1;

    INSERT INTO registrations (
        event_id, 
        player_id, 
        status, 
        registration_source,
        position
    ) VALUES (
        p_event_id, 
        p_target_player_id, 
        'confirmed', 
        p_registration_source,
        v_assigned_position
    );

    RETURN jsonb_build_object(
        'status', 'success',
        'registration', jsonb_build_object(
            'event_id', p_event_id,
            'player_id', p_target_player_id,
            'out_list_type', CASE WHEN v_assigned_position <= v_limit THEN 'main' ELSE 'wait' END
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- Adicionar restrição a internal_add_event_guest para bloquear múltiplos convidados em alta concorrência
CREATE OR REPLACE FUNCTION internal_add_event_guest(
    p_token TEXT,
    p_event_id UUID,
    p_nome_convidado TEXT
) RETURNS JSONB AS $$
DECLARE
    v_player_id UUID;
    v_group_id UUID;
    v_event_status TEXT;
    v_guest_enabled BOOLEAN;
    v_guest_limit INTEGER;
    v_current_guests INTEGER;
    v_new_reg_id UUID;
BEGIN
    v_player_id := internal_validate_session(p_token);
    IF v_player_id IS NULL THEN
        RAISE EXCEPTION 'invalid_session';
    END IF;

    -- Detalhes da rodada
    SELECT status, group_id INTO v_event_status, v_group_id
    FROM volleyball_events WHERE id = p_event_id;

    IF v_event_status = 'scheduled' THEN
        RAISE EXCEPTION 'A lista ainda não foi aberta.';
    END IF;

    IF v_event_status IN ('closed', 'completed', 'cancelled') THEN
        RAISE EXCEPTION 'A lista já está encerrada.';
    END IF;

    -- Detalhes da turma
    SELECT 
        convidados_habilitados,
        COALESCE(limite_convidados_por_usuario, 1)
    INTO v_guest_enabled, v_guest_limit
    FROM app_settings
    WHERE group_id = v_group_id;

    IF NOT v_guest_enabled THEN
        RAISE EXCEPTION 'Convidados não estão habilitados para esta turma.';
    END IF;

    -- Concorrência / Validação de limite
    PERFORM 1 FROM registrations 
    WHERE event_id = p_event_id AND registered_by_player_id = v_player_id 
    FOR UPDATE;

    SELECT COUNT(*) INTO v_current_guests
    FROM registrations
    WHERE event_id = p_event_id 
      AND registered_by_player_id = v_player_id
      AND is_guest = true
      AND status != 'cancelled';

    IF v_current_guests >= v_guest_limit THEN
        RAISE EXCEPTION 'Você já atingiu o limite de % convidado(s) por rodada.', v_guest_limit;
    END IF;

    -- Inserir o convidado
    INSERT INTO registrations (
        event_id,
        player_id,
        player_name,
        is_guest,
        registered_by_player_id,
        status,
        registration_source,
        position
    ) VALUES (
        p_event_id,
        gen_random_uuid(),
        p_nome_convidado,
        true,
        v_player_id,
        'confirmed',
        'guest',
        (SELECT COUNT(*) + 1 FROM registrations WHERE event_id = p_event_id AND status != 'cancelled')
    ) RETURNING id INTO v_new_reg_id;

    RETURN jsonb_build_object(
        'status', 'success',
        'registration_id', v_new_reg_id,
        'guest_name', p_nome_convidado
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
