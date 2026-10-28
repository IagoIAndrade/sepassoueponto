-- Estabilização da RPC administrativa de remoção (v4)
-- Corrige o erro de cast 'waiting' vs 'wait' e unifica a lógica de promoção.

CREATE OR REPLACE FUNCTION public.admin_remove_registration_v3(
  p_registration_id uuid,
  p_admin_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reg record;
  v_event_id uuid;
  v_promoted_reg_id uuid := NULL;
  v_wait_row record;
  v_next_pos int;
  v_event_date date;
BEGIN
  -- 1. Buscar a inscrição com lock de linha
  SELECT id, event_id, list_type, position_number, cancelled_at, player_id
  INTO v_reg 
  FROM public.registrations 
  WHERE id = p_registration_id
  FOR UPDATE;
  
  IF NOT FOUND THEN 
    RETURN jsonb_build_object('ok', false, 'error', 'registration_not_found'); 
  END IF;
  
  v_event_id := v_reg.event_id;

  -- 2. Lock do evento para evitar concorrência na reordenação (Advisory Lock)
  PERFORM pg_advisory_xact_lock(hashtextextended(v_event_id::text, 42));
  
  -- 3. Já cancelada?
  IF v_reg.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'message', 'already_cancelled');
  END IF;
  
  -- 4. Buscar data do evento para checar blocks na promoção
  SELECT event_date INTO v_event_date FROM public.volleyball_events WHERE id = v_event_id;
  
  -- 5. Cancelar a inscrição alvo
  UPDATE public.registrations 
  SET cancelled_at = now(), 
      cancelled_by_player_id = p_admin_user_id
  WHERE id = p_registration_id;
  
  -- 6. Reorganizar
  -- IMPORTANTE: Comparar list_type usando ::text para evitar conflitos de enum implícitos
  IF v_reg.list_type::text = 'main' THEN
    -- Compactar lista principal
    UPDATE public.registrations 
    SET position_number = position_number - 1
    WHERE event_id = v_event_id 
      AND list_type = 'main'::public.list_type 
      AND cancelled_at IS NULL 
      AND position_number > v_reg.position_number;
    
    -- Tentar promover o primeiro da reserva (wait) que não esteja bloqueado
    FOR v_wait_row IN 
      SELECT id, player_id, position_number 
      FROM public.registrations
      WHERE event_id = v_event_id 
        AND list_type = 'wait'::public.list_type 
        AND cancelled_at IS NULL
      ORDER BY position_number ASC
      FOR UPDATE
    LOOP
      -- Verificar se o jogador está bloqueado para esta data
      IF public.internal_is_blocked(v_wait_row.player_id, v_event_date) THEN
         -- Jogador bloqueado: cancela a inscrição dele na reserva
         UPDATE public.registrations 
         SET cancelled_at = now(),
             cancelled_by_player_id = p_admin_user_id
         WHERE id = v_wait_row.id;
         
         -- Compactar reserva (pois este foi removido)
         UPDATE public.registrations 
         SET position_number = position_number - 1
         WHERE event_id = v_event_id 
           AND list_type = 'wait'::public.list_type 
           AND cancelled_at IS NULL 
           AND position_number > v_wait_row.position_number;
           
         CONTINUE;
      END IF;
      
      -- Encontrar próxima posição disponível na principal
      SELECT coalesce(max(position_number), 0) + 1 INTO v_next_pos 
      FROM public.registrations
      WHERE event_id = v_event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL;
      
      -- Promover o reserva
      UPDATE public.registrations 
      SET list_type = 'main'::public.list_type, 
          position_number = v_next_pos 
      WHERE id = v_wait_row.id;
      
      -- Compactar o restante da reserva
      UPDATE public.registrations 
      SET position_number = position_number - 1
      WHERE event_id = v_event_id 
        AND list_type = 'wait'::public.list_type 
        AND cancelled_at IS NULL 
        AND position_number > v_wait_row.position_number;
      
      v_promoted_reg_id := v_wait_row.id;
      EXIT; -- Promoveu um, encerra o loop
    END LOOP;
  ELSE
    -- Se o removido era da reserva, apenas compacta a reserva
    UPDATE public.registrations 
    SET position_number = position_number - 1
    WHERE event_id = v_event_id 
      AND list_type = 'wait'::public.list_type 
      AND cancelled_at IS NULL 
      AND position_number > v_reg.position_number;
  END IF;
  
  -- 7. Log de auditoria
  BEGIN
    INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
    VALUES (p_admin_user_id, 'admin_remove_registration', 'registration', p_registration_id,
            jsonb_build_object(
              'event_id', v_event_id, 
              'player_id', v_reg.player_id, 
              'promoted_reg_id', v_promoted_reg_id,
              'list_type', v_reg.list_type::text
            ));
  EXCEPTION WHEN OTHERS THEN 
    -- Silent failure for log
  END;
  
  RETURN jsonb_build_object(
    'ok', true, 
    'cancelled_id', p_registration_id, 
    'promoted_id', v_promoted_reg_id
  );
END;
$$;
