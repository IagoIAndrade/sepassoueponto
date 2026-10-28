CREATE OR REPLACE FUNCTION public.admin_remove_registration_v3(
  p_registration_id uuid,
  p_admin_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg record;
  v_event_id uuid;
  v_promoted uuid;
  v_wait_row record;
  v_next_pos int;
  v_list_type_main public.list_type;
  v_list_type_wait public.list_type;
BEGIN
  -- 1. Resolver literais do enum de forma segura para evitar erros de casting
  v_list_type_main := 'main'::text::public.list_type;
  v_list_type_wait := 'wait'::text::public.list_type;

  -- 2. Buscar a inscrição com lock de linha
  SELECT id, event_id, list_type, position_number, cancelled_at 
  INTO v_reg 
  FROM public.registrations 
  WHERE id = p_registration_id
  FOR UPDATE;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  
  v_event_id := v_reg.event_id;

  -- 3. Lock do evento para evitar concorrência na reordenação
  PERFORM pg_advisory_xact_lock(hashtextextended(v_event_id::text, 42));
  
  -- 4. Já cancelada?
  IF v_reg.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'message', 'already_cancelled');
  END IF;
  
  -- 5. Cancelar a inscrição alvo
  UPDATE public.registrations 
  SET cancelled_at = now(), 
      cancelled_by_player_id = p_admin_user_id
  WHERE id = p_registration_id;
  
  -- 6. Reorganizar
  IF v_reg.list_type = v_list_type_main THEN
    -- Compactar lista principal
    UPDATE public.registrations 
    SET position_number = position_number - 1
    WHERE event_id = v_event_id 
      AND list_type = v_list_type_main
      AND cancelled_at IS NULL 
      AND position_number > v_reg.position_number;
    
    -- Tentar promover o primeiro da reserva (wait)
    FOR v_wait_row IN 
      SELECT id, player_id, position_number FROM public.registrations
      WHERE event_id = v_event_id AND list_type = v_list_type_wait AND cancelled_at IS NULL
      ORDER BY position_number ASC
      FOR UPDATE
    LOOP
      -- Verificar se o jogador está bloqueado para esta data
      IF public.internal_is_blocked(v_wait_row.player_id, (SELECT event_date FROM public.volleyball_events WHERE id = v_event_id)) THEN
         UPDATE public.registrations SET cancelled_at = now() WHERE id = v_wait_row.id;
         UPDATE public.registrations SET position_number = position_number - 1
         WHERE event_id = v_event_id AND list_type = v_list_type_wait AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
         CONTINUE;
      END IF;
      
      -- Encontrar próxima posição na principal
      SELECT coalesce(max(position_number), 0) + 1 INTO v_next_pos 
      FROM public.registrations
      WHERE event_id = v_event_id AND list_type = v_list_type_main AND cancelled_at IS NULL;
      
      -- Promover o reserva
      UPDATE public.registrations 
      SET list_type = v_list_type_main, 
          position_number = v_next_pos 
      WHERE id = v_wait_row.id;
      
      -- Reordenar o restante da reserva
      UPDATE public.registrations SET position_number = position_number - 1
      WHERE event_id = v_event_id AND list_type = v_list_type_wait AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
      
      v_promoted := v_wait_row.id;
      EXIT; -- Promoveu um, encerra o loop
    END LOOP;
  ELSE
    -- Se o removido era da reserva, apenas compacta a reserva
    UPDATE public.registrations 
    SET position_number = position_number - 1
    WHERE event_id = v_event_id 
      AND list_type = v_list_type_wait
      AND cancelled_at IS NULL 
      AND position_number > v_reg.position_number;
  END IF;
  
  RETURN jsonb_build_object('ok', true, 'cancelled_id', p_registration_id, 'promoted_id', v_promoted);
END;
$$;