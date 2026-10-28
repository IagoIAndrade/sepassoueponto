CREATE OR REPLACE FUNCTION public.admin_remove_registration_v2(
  p_registration_id uuid,
  p_admin_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg public.registrations;
  v_event_id uuid;
  v_promoted uuid;
  v_wait_row public.registrations;
  v_next_pos int;
BEGIN
  -- 1. Buscar a inscrição
  SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  
  v_event_id := v_reg.event_id;

  -- 2. Lock do evento para atomicidade
  PERFORM public.lock_event(v_event_id);
  
  -- 3. Verificar se já está cancelada
  IF v_reg.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'message', 'already_cancelled', 'cancelled_id', p_registration_id);
  END IF;
  
  -- 4. Cancelar a inscrição
  UPDATE public.registrations 
  SET cancelled_at = now(), 
      cancelled_by_player_id = p_admin_user_id
  WHERE id = p_registration_id;
  
  -- 5. Reorganizar a lista de onde o jogador saiu
  IF v_reg.list_type = 'main' THEN
    -- Compactar lista principal
    UPDATE public.registrations 
    SET position_number = position_number - 1
    WHERE event_id = v_event_id 
      AND list_type = 'main' 
      AND cancelled_at IS NULL 
      AND position_number > v_reg.position_number;
    
    -- Tentar promover o primeiro da reserva
    LOOP
      SELECT * INTO v_wait_row FROM public.registrations
      WHERE event_id = v_event_id AND list_type = 'wait' AND cancelled_at IS NULL
      ORDER BY position_number ASC LIMIT 1;
      
      EXIT WHEN v_wait_row.id IS NULL;
      
      -- Verificar se está bloqueado
      IF public.internal_is_blocked(v_wait_row.player_id, (SELECT event_date FROM public.volleyball_events WHERE id = v_event_id)) THEN
         UPDATE public.registrations SET cancelled_at = now() WHERE id = v_wait_row.id;
         UPDATE public.registrations SET position_number = position_number - 1
         WHERE event_id = v_event_id AND list_type = 'wait' AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
         v_wait_row := null;
         CONTINUE;
      END IF;
      
      -- Promover
      SELECT coalesce(max(position_number), 0) + 1 INTO v_next_pos FROM public.registrations
      WHERE event_id = v_event_id AND list_type = 'main' AND cancelled_at IS NULL;
      
      UPDATE public.registrations 
      SET list_type = 'main', position_number = v_next_pos 
      WHERE id = v_wait_row.id;
      
      -- Reordena o resto da reserva
      UPDATE public.registrations SET position_number = position_number - 1
      WHERE event_id = v_event_id AND list_type = 'wait' AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
      
      v_promoted := v_wait_row.id;
      EXIT;
    END LOOP;
  ELSE
    -- Reordena a reserva
    UPDATE public.registrations 
    SET position_number = position_number - 1
    WHERE event_id = v_event_id 
      AND list_type = 'wait' 
      AND cancelled_at IS NULL 
      AND position_number > v_reg.position_number;
  END IF;
  
  -- 6. Log (usando internal_sync_event_status para garantir logs consistentes)
  BEGIN
    INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
    VALUES (p_admin_user_id, 'admin_remove_registration', 'registration', p_registration_id,
            jsonb_build_object('event_id', v_event_id, 'player_id', v_reg.player_id, 'promoted_id', v_promoted));
  EXCEPTION WHEN OTHERS THEN
    -- Silently fail log if table doesn't exist
  END;
  
  RETURN jsonb_build_object('ok', true, 'cancelled_id', p_registration_id, 'promoted_id', v_promoted);
END;
$$;