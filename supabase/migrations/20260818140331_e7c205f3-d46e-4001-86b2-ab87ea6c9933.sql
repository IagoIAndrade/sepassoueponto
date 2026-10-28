
-- MIGRATION: Fix Registration Removal and Reordering to avoid Unique Constraint Collisions
-- Implementa reordenação em duas fases para evitar duplicate key em uq_reg_position_active

CREATE OR REPLACE FUNCTION public.admin_remove_registration_v3(p_registration_id uuid, p_admin_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $function$
DECLARE
  v_reg record;
  v_event_id uuid;
  v_promoted uuid;
  v_wait_row record;
  v_next_pos int;
BEGIN
  -- 1. Buscar a inscrição com lock de linha
  SELECT id, event_id, list_type, position_number, cancelled_at 
  INTO v_reg 
  FROM public.registrations 
  WHERE id = p_registration_id
  FOR UPDATE;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  
  v_event_id := v_reg.event_id;

  -- 2. Lock do evento para evitar concorrência na reordenação
  PERFORM pg_advisory_xact_lock(hashtextextended(v_event_id::text, 42));
  
  -- 3. Já cancelada?
  IF v_reg.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'message', 'already_cancelled');
  END IF;
  
  -- 4. Cancelar a inscrição alvo (libera a posição no índice condicional)
  UPDATE public.registrations 
  SET cancelled_at = now(), 
      cancelled_by_player_id = p_admin_user_id
  WHERE id = p_registration_id;
  
  -- 5. Reorganizar usando estratégia de duas fases para evitar colisões
  IF v_reg.list_type::text = 'main' THEN
    -- Fase 1: Mover para posições negativas temporárias
    UPDATE public.registrations 
    SET position_number = -1 * position_number
    WHERE event_id = v_event_id 
      AND list_type = 'main'::public.list_type
      AND cancelled_at IS NULL 
      AND position_number > v_reg.position_number;

    -- Fase 2: Mover para posições definitivas (pos - 1)
    UPDATE public.registrations 
    SET position_number = (-1 * position_number) - 1
    WHERE event_id = v_event_id 
      AND list_type = 'main'::public.list_type
      AND cancelled_at IS NULL 
      AND position_number < 0;
    
    -- Tentar promover o primeiro da reserva (wait)
    FOR v_wait_row IN 
      SELECT id, player_id, position_number FROM public.registrations
      WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL
      ORDER BY position_number ASC
      FOR UPDATE
    LOOP
      -- Verificar se o jogador está bloqueado
      IF public.internal_is_blocked(v_wait_row.player_id, (SELECT event_date FROM public.volleyball_events WHERE id = v_event_id)) THEN
         UPDATE public.registrations SET cancelled_at = now() WHERE id = v_wait_row.id;
         
         -- Reordenar reserva (Fase 1 e 2)
         UPDATE public.registrations SET position_number = -1 * position_number
         WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
         
         UPDATE public.registrations SET position_number = (-1 * position_number) - 1
         WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number < 0;
         
         CONTINUE;
      END IF;
      
      -- Encontrar próxima posição na principal
      SELECT coalesce(max(position_number), 0) + 1 INTO v_next_pos 
      FROM public.registrations
      WHERE event_id = v_event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL;
      
      -- Promover o reserva
      UPDATE public.registrations 
      SET list_type = 'main'::public.list_type, 
          position_number = v_next_pos 
      WHERE id = v_wait_row.id;
      
      -- Reordenar o restante da reserva (Fase 1 e 2)
      UPDATE public.registrations SET position_number = -1 * position_number
      WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;

      UPDATE public.registrations SET position_number = (-1 * position_number) - 1
      WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number < 0;
      
      v_promoted := v_wait_row.id;
      EXIT;
    END LOOP;
  ELSIF v_reg.list_type::text = 'wait' THEN
    -- Compactar reserva (Fase 1 e 2)
    UPDATE public.registrations 
    SET position_number = -1 * position_number
    WHERE event_id = v_event_id 
      AND list_type = 'wait'::public.list_type
      AND cancelled_at IS NULL 
      AND position_number > v_reg.position_number;

    UPDATE public.registrations 
    SET position_number = (-1 * position_number) - 1
    WHERE event_id = v_event_id 
      AND list_type = 'wait'::public.list_type
      AND cancelled_at IS NULL 
      AND position_number < 0;
  END IF;
  
  -- 6. Log de auditoria
  BEGIN
    INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
    VALUES (p_admin_user_id, 'admin_remove_registration', 'registration', p_registration_id,
            jsonb_build_object('event_id', v_event_id, 'player_id', v_reg.player_id, 'promoted_id', v_promoted));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  RETURN jsonb_build_object('ok', true, 'cancelled_id', p_registration_id, 'promoted_id', v_promoted);
END;
$function$;

CREATE OR REPLACE FUNCTION public.internal_leave_registration_v3(p_registration_id uuid, p_player_id uuid, p_confirm_late_leave boolean DEFAULT false)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
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
    v_next_pos int;
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

    -- Cancelar
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

    -- Promoção automática se necessário
    IF v_reg.list_type = 'main'::public.list_type AND COALESCE(v_settings.auto_promote_reservations, true) THEN
        SELECT id INTO v_next_wait_id
        FROM public.registrations
        WHERE event_id = v_reg.event_id
          AND cancelled_at IS NULL
          AND list_type = 'wait'::public.list_type
        ORDER BY position_number ASC
        LIMIT 1
        FOR UPDATE;

        IF v_next_wait_id IS NOT NULL THEN
            -- Encontrar próxima posição na principal (antes de reordenar o restante, para ser o max+1 atual)
            -- Mas o v_reg liberou uma vaga. Se a lista tinha 18, agora tem 17 + buraco.
            -- O reordenamento abaixo vai fechar o buraco. O promovido deve ir para a última vaga (18).
            
            -- Reordenar afetados da principal (Fase 1 e 2)
            UPDATE public.registrations SET position_number = -1 * position_number
            WHERE event_id = v_reg.event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL AND position_number > v_reg.position_number;

            UPDATE public.registrations SET position_number = (-1 * position_number) - 1
            WHERE event_id = v_reg.event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL AND position_number < 0;

            SELECT COALESCE(max(position_number), 0) + 1 INTO v_next_pos 
            FROM public.registrations 
            WHERE event_id = v_reg.event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL;

            UPDATE public.registrations
            SET list_type = 'main'::public.list_type,
                position_number = v_next_pos
            WHERE id = v_next_wait_id;

            -- Reordenar reserva (Fase 1 e 2)
            -- Como o primeiro foi promovido, todos os outros da reserva descem 1.
            UPDATE public.registrations SET position_number = -1 * position_number
            WHERE event_id = v_reg.event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL;

            UPDATE public.registrations SET position_number = (-1 * position_number) - 1
            WHERE event_id = v_reg.event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number < 0;
            
            RETURN json_build_object('ok', true, 'is_late', v_is_late, 'promoted_id', v_next_wait_id);
        END IF;
    END IF;

    -- Se não houve promoção ou se foi da reserva, reordena normalmente (Fase 1 e 2)
    UPDATE public.registrations SET position_number = -1 * position_number
    WHERE event_id = v_reg.event_id
      AND list_type = v_reg.list_type
      AND cancelled_at IS NULL
      AND position_number > v_reg.position_number;

    UPDATE public.registrations SET position_number = (-1 * position_number) - 1
    WHERE event_id = v_reg.event_id
      AND list_type = v_reg.list_type
      AND cancelled_at IS NULL
      AND position_number < 0;

    RETURN json_build_object('ok', true, 'is_late', v_is_late);
END;
$function$;
