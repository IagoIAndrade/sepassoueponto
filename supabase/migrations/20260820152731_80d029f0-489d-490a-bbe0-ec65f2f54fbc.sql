CREATE OR REPLACE FUNCTION public.internal_leave_registration_v3(
    p_registration_id uuid,
    p_player_id uuid,
    p_confirm_late_leave boolean DEFAULT false
)
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
    v_temp_offset int := 10000;
    v_withdrawal_id uuid;
    v_incident_id uuid;
    v_block_id uuid;
    v_target_date date;
    v_loop_date date;
    v_i int;
BEGIN
    -- 1. Carregar Inscrição com Lock
    SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id AND player_id = p_player_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found'; END IF;
    
    -- Se já cancelado, retornar sucesso silencioso
    IF v_reg.cancelled_at IS NOT NULL THEN 
        RETURN jsonb_build_object('status', 'already_cancelled', 'ok', true); 
    END IF;

    -- 2. Carregar Evento e Configurações
    SELECT * INTO v_event FROM public.volleyball_events WHERE id = v_reg.event_id;
    SELECT * INTO v_settings FROM public.app_settings WHERE group_id = v_event.group_id;

    -- 3. Calcular Deadline Canônico (America/Sao_Paulo)
    -- O dia limite é o weekday configurado (0-6) na semana da rodada
    v_deadline_ts := (v_event.event_date - ((EXTRACT(DOW FROM v_event.event_date)::int - v_settings.withdrawal_deadline_weekday + 7) % 7))::timestamp + v_settings.withdrawal_deadline_time;
    -- Ajustar para o timezone correto para comparação com now()
    v_deadline_ts := v_deadline_ts AT TIME ZONE v_settings.timezone;

    v_is_late := now() > v_deadline_ts;

    -- 4. Pedir confirmação se atrasado
    IF v_is_late AND NOT p_confirm_late_leave THEN
        RETURN jsonb_build_object(
            'status', 'late_leave_confirmation_required',
            'ok', false,
            'deadline_at', v_deadline_ts,
            'penalty_late_leave', COALESCE(v_settings.penalty_late_leave, 0),
            'timezone', v_settings.timezone
        );
    END IF;

    -- 5. Bloqueio de Transação por Evento
    PERFORM pg_advisory_xact_lock(hashtextextended(v_reg.event_id::text, 42));

    -- 6. Cancelar Inscrição
    UPDATE public.registrations 
    SET cancelled_at = now(), 
        cancelled_by_player_id = p_player_id, 
        cancelled_by_admin_user_id = NULL 
    WHERE id = p_registration_id;

    -- 7. Registrar Retirada (Audit Log)
    INSERT INTO public.registration_withdrawals (
        registration_id, event_id, group_id, 
        removal_source, removed_by_player_id, 
        deadline_status, removed_at
    ) VALUES (
        p_registration_id, v_reg.event_id, v_event.group_id,
        'player', p_player_id,
        CASE WHEN v_is_late THEN 'late'::public.deadline_status ELSE 'on_time'::public.deadline_status END,
        now()
    ) RETURNING id INTO v_withdrawal_id;

    -- 8. Se Atrasado: Gerar Ocorrência e Aplicar Bloqueio
    IF v_is_late THEN
        -- Ocorrência (Idempotente por player+event+type)
        INSERT INTO public.player_incidents (
            player_id, event_id, group_id, 
            incident_type, occurred_at, 
            suggested_rounds, status, 
            justification, scope
        )
        VALUES (
            p_player_id, v_reg.event_id, v_event.group_id,
            'late_leave', now(),
            COALESCE(v_settings.penalty_late_leave, 0), 'pending',
            'Saída confirmada após o prazo', 'group'
        )
        ON CONFLICT (player_id, event_id, incident_type) DO UPDATE SET occurred_at = now()
        RETURNING id INTO v_incident_id;

        -- Bloqueio nas próximas N rodadas válidas
        IF COALESCE(v_settings.penalty_late_leave, 0) > 0 THEN
            v_i := 0;
            v_loop_date := v_event.event_date;
            
            WHILE v_i < v_settings.penalty_late_leave LOOP
                v_loop_date := v_loop_date + interval '1 day';
                
                SELECT event_date INTO v_target_date 
                FROM public.volleyball_events 
                WHERE group_id = v_event.group_id 
                  AND event_date >= v_loop_date 
                  AND status IN ('scheduled', 'open')
                ORDER BY event_date ASC LIMIT 1;

                IF NOT FOUND THEN
                    v_target_date := v_loop_date;
                    v_i := v_i + 1;
                ELSE
                    v_loop_date := v_target_date;
                    v_i := v_i + 1;
                END IF;
                
                INSERT INTO public.player_blocks (
                    player_id, group_id, incident_id,
                    starts_at, ends_at, reason, active
                ) VALUES (
                    p_player_id, v_event.group_id, v_incident_id,
                    v_target_date, v_target_date,
                    'Penalidade por saída tardia (' || v_i || '/' || v_settings.penalty_late_leave || ')',
                    true
                );
            END LOOP;
        END IF;
    END IF;

    -- 9. Reorganizar Lista e Promover Reservas
    IF v_reg.list_type::text = 'main' THEN
        UPDATE public.registrations 
        SET position_number = position_number + v_temp_offset 
        WHERE event_id = v_reg.event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL AND position_number > v_reg.position_number;
        
        UPDATE public.registrations 
        SET position_number = (position_number - v_temp_offset) - 1 
        WHERE event_id = v_reg.event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL AND position_number > v_temp_offset;

        FOR v_next_reg IN 
            SELECT id, player_id, position_number FROM public.registrations 
            WHERE event_id = v_reg.event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL 
            ORDER BY position_number ASC FOR UPDATE
        LOOP
            IF NOT public.internal_is_blocked(v_next_reg.player_id, v_event.event_date, v_event.group_id) THEN
                SELECT COALESCE(MAX(position_number), 0) + 1 INTO v_next_pos 
                FROM public.registrations 
                WHERE event_id = v_reg.event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL;
                
                UPDATE public.registrations SET list_type = 'main'::public.list_type, position_number = v_next_pos WHERE id = v_next_reg.id;
                
                UPDATE public.registrations 
                SET position_number = position_number + v_temp_offset 
                WHERE event_id = v_reg.event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_next_reg.position_number;
                
                UPDATE public.registrations 
                SET position_number = (position_number - v_temp_offset) - 1 
                WHERE event_id = v_reg.event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_temp_offset;
                
                v_promoted_reg_id := v_next_reg.id;
                EXIT;
            ELSE
                UPDATE public.registrations SET cancelled_at = now(), cancelled_by_player_id = NULL WHERE id = v_next_reg.id;
            END IF;
        END LOOP;
    ELSE
        UPDATE public.registrations 
        SET position_number = position_number + v_temp_offset 
        WHERE event_id = v_reg.event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_reg.position_number;
        
        UPDATE public.registrations 
        SET position_number = (position_number - v_temp_offset) - 1 
        WHERE event_id = v_reg.event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_temp_offset;
    END IF;

    RETURN jsonb_build_object(
        'status', 'success',
        'ok', true,
        'is_late', v_is_late,
        'promoted_id', v_promoted_reg_id,
        'incident_id', v_incident_id
    );
END;
$function$;
