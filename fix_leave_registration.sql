CREATE OR REPLACE FUNCTION public.internal_leave_registration_v2(
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
    v_next_player_id uuid;
    v_penalty_rounds integer;
BEGIN
    -- 1. Obter dados da inscrição e bloquear linha para atomicidade
    SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id FOR UPDATE;

    IF v_reg.id IS NULL THEN
        RETURN json_build_object('ok', false, 'error', 'Inscrição não encontrada');
    END IF;

    -- Permitir que o próprio jogador ou um admin (via role ou se foi quem inscreveu) saia
    -- Aqui validamos se o p_player_id é o dono da inscrição ou quem inscreveu
    IF v_reg.player_id != p_player_id AND v_reg.registered_by_player_id != p_player_id THEN
        -- Adicionalmente, se precisarmos de permissão de admin real, checaríamos has_role aqui
        -- Mas para o LEAVE_SELF do usuário, o p_player_id enviado pelo server-side wrapper é o do token.
        RETURN json_build_object('ok', false, 'error', 'Não autorizado');
    END IF;

    IF v_reg.cancelled_at IS NOT NULL THEN
        RETURN json_build_object('ok', true); -- Já saiu
    END IF;

    -- Bloquear o evento para evitar race conditions na lista
    PERFORM public.lock_event(v_reg.event_id);

    SELECT * INTO v_event FROM public.volleyball_events WHERE id = v_reg.event_id;
    
    -- Obter configurações da turma
    SELECT * INTO v_settings FROM public.app_settings WHERE group_id = v_event.group_id;
    
    -- Definir "agora" no timezone correto
    v_now := now() AT TIME ZONE (COALESCE(v_settings.timezone, 'America/Sao_Paulo'));

    -- Calcular timestamp do prazo
    v_deadline_timestamp := (
        v_event.event_date + v_settings.withdrawal_deadline_time
    )::timestamp;

    -- Ajustar o deadline se o dia da semana for diferente do dia do evento (ex: prazo na terça para evento na quinta)
    -- withdrawal_deadline_weekday (0-6, onde 0=domingo, 1=segunda...)
    -- event_weekday do postgres costuma ser 0-6 ou 1-7. Aqui usamos a lógica de diferença de dias.
    IF v_settings.withdrawal_deadline_weekday IS NOT NULL THEN
        -- No postgres, extract(dow from date) retorna 0 (domingo) a 6 (sábado)
        -- Queremos que o v_deadline_timestamp seja no dia da semana especificado na mesma semana do evento ou na anterior.
        -- Como os eventos são semanais, calculamos a diferença entre o dia do evento e o dia do prazo.
        DECLARE
            v_event_dow int := extract(dow from v_event.event_date);
            v_diff int := v_event_dow - v_settings.withdrawal_deadline_weekday;
        BEGIN
            IF v_diff < 0 THEN v_diff := v_diff + 7; END IF;
            v_deadline_timestamp := v_deadline_timestamp - (v_diff || ' days')::interval;
        END;
    END IF;

    v_is_late := v_now > v_deadline_timestamp;
    v_penalty_rounds := COALESCE(v_settings.penalty_late_leave, 1);

    -- 2. Se for saída tardia e não confirmou, retornar erro controlado para o frontend pedir confirmação
    IF v_is_late AND NOT p_confirm_late_leave THEN
        RETURN json_build_object(
            'status', 'late_leave_confirmation_required',
            'deadline_at', v_deadline_timestamp,
            'penalty_late_leave', v_penalty_rounds,
            'timezone', COALESCE(v_settings.timezone, 'America/Sao_Paulo')
        );
    END IF;

    -- 3. Iniciar processo de saída
    UPDATE public.registrations 
    SET cancelled_at = now() 
    WHERE id = p_registration_id;

    -- 4. Se for saída tardia, registrar ocorrência
    IF v_is_late THEN
        INSERT INTO public.player_incidents (
            event_id,
            player_id,
            group_id,
            incident_type,
            occurred_at,
            suggested_rounds,
            status,
            justification,
            scope
        ) VALUES (
            v_reg.event_id,
            v_reg.player_id,
            v_event.group_id,
            'late_leave',
            now(),
            v_penalty_rounds,
            'pending',
            'Saída confirmada após o prazo de ' || to_char(v_deadline_timestamp, 'DD/MM HH24:MI'),
            'group'
        );
    END IF;

    -- 5. Promoção automática da reserva se necessário
    -- Somente se o que saiu era titular e as promoções automáticas estiverem ativas
    IF v_reg.waitlist_order IS NULL AND COALESCE(v_settings.auto_promote_reservations, true) THEN
        SELECT id, player_id INTO v_next_wait_id, v_next_player_id
        FROM public.registrations
        WHERE event_id = v_reg.event_id
          AND cancelled_at IS NULL
          AND waitlist_order IS NOT NULL
        ORDER BY waitlist_order ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED;

        IF v_next_wait_id IS NOT NULL THEN
            UPDATE public.registrations
            SET waitlist_order = NULL
            WHERE id = v_next_wait_id;

            -- Reordenar o restante da fila de espera
            UPDATE public.registrations
            SET waitlist_order = waitlist_order - 1
            WHERE event_id = v_reg.event_id
              AND cancelled_at IS NULL
              AND waitlist_order > (SELECT waitlist_order FROM public.registrations WHERE id = v_next_wait_id);
              
            -- Log de promoção para depuração/notificação
            RAISE NOTICE 'Jogador % promovido no evento %', v_next_player_id, v_reg.event_id;
        END IF;
    ELSIF v_reg.waitlist_order IS NOT NULL THEN
        -- Se o que saiu era da reserva, apenas reordenar quem estava atrás dele
        UPDATE public.registrations
        SET waitlist_order = waitlist_order - 1
        WHERE event_id = v_reg.event_id
          AND cancelled_at IS NULL
          AND waitlist_order > v_reg.waitlist_order;
    END IF;

    RETURN json_build_object('ok', true, 'is_late', v_is_late);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v2(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v2(uuid, uuid, boolean) TO service_role;
