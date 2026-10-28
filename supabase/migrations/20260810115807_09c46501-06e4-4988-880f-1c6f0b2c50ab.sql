CREATE OR REPLACE FUNCTION public.fn_notify_promotion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_event_name TEXT;
    v_group_id UUID;
BEGIN
    -- Corrigido 'waiting' para 'wait' para bater com o enum list_type
    IF (NEW.list_type::text = 'main' AND (OLD.list_type IS NULL OR OLD.list_type::text = 'wait' OR OLD.cancelled_at IS NOT NULL) AND NEW.cancelled_at IS NULL) THEN
        
        SELECT g.name, e.group_id INTO v_event_name, v_group_id
        FROM public.volleyball_events e
        JOIN public.groups g ON g.id = e.group_id
        WHERE e.id = NEW.event_id;

        INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
        VALUES (
            NEW.player_id, 
            'promoted_to_main', 
            v_group_id, 
            NEW.event_id, 
            jsonb_build_object('message', 'Sua vaga para ' || v_event_name || ' foi confirmada.'),
            'promo-' || NEW.player_id || '-' || NEW.event_id || '-' || extract(epoch from now())::text
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$function$;

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
  
  -- 4. Cancelar a inscrição alvo
  UPDATE public.registrations 
  SET cancelled_at = now(), 
      cancelled_by_player_id = p_admin_user_id
  WHERE id = p_registration_id;
  
  -- 5. Reorganizar
  IF v_reg.list_type::text = 'main' THEN
    -- Compactar lista principal
    UPDATE public.registrations 
    SET position_number = position_number - 1
    WHERE event_id = v_event_id 
      AND list_type::text = 'main'
      AND cancelled_at IS NULL 
      AND position_number > v_reg.position_number;
    
    -- Tentar promover o primeiro da reserva (wait)
    FOR v_wait_row IN 
      SELECT id, player_id, position_number FROM public.registrations
      WHERE event_id = v_event_id AND list_type::text = 'wait' AND cancelled_at IS NULL
      ORDER BY position_number ASC
      FOR UPDATE
    LOOP
      -- Verificar se o jogador está bloqueado para esta data
      IF public.internal_is_blocked(v_wait_row.player_id, (SELECT event_date FROM public.volleyball_events WHERE id = v_event_id)) THEN
         UPDATE public.registrations SET cancelled_at = now() WHERE id = v_wait_row.id;
         UPDATE public.registrations SET position_number = position_number - 1
         WHERE event_id = v_event_id AND list_type::text = 'wait' AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
         CONTINUE;
      END IF;
      
      -- Encontrar próxima posição na principal
      SELECT coalesce(max(position_number), 0) + 1 INTO v_next_pos 
      FROM public.registrations
      WHERE event_id = v_event_id AND list_type::text = 'main' AND cancelled_at IS NULL;
      
      -- Promover o reserva
      UPDATE public.registrations 
      SET list_type = 'main'::public.list_type, 
          position_number = v_next_pos 
      WHERE id = v_wait_row.id;
      
      -- Reordenar o restante da reserva
      UPDATE public.registrations SET position_number = position_number - 1
      WHERE event_id = v_event_id AND list_type::text = 'wait' AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
      
      v_promoted := v_wait_row.id;
      EXIT; -- Promoveu um, encerra o loop
    END LOOP;
  ELSIF v_reg.list_type::text = 'wait' THEN
    -- Se o removido era da reserva, apenas compacta a reserva
    UPDATE public.registrations 
    SET position_number = position_number - 1
    WHERE event_id = v_event_id 
      AND list_type::text = 'wait'
      AND cancelled_at IS NULL 
      AND position_number > v_reg.position_number;
  END IF;
  
  -- 6. Log de auditoria (silencioso)
  BEGIN
    INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
    VALUES (p_admin_user_id, 'admin_remove_registration', 'registration', p_registration_id,
            jsonb_build_object('event_id', v_event_id, 'player_id', v_reg.player_id, 'promoted_id', v_promoted));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  RETURN jsonb_build_object('ok', true, 'cancelled_id', p_registration_id, 'promoted_id', v_promoted);
END;
$$;