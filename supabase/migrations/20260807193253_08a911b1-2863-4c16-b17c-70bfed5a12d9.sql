CREATE OR REPLACE FUNCTION public.admin_add_player(p_event_id uuid, p_target_player_id uuid, p_list_type list_type, p_admin_user_id uuid, p_force_override boolean DEFAULT false, p_registration_source text DEFAULT 'admin')
 RETURNS TABLE(out_registration_id uuid, out_list_type list_type, out_position_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE 
    v_event public.volleyball_events; 
    v_pos int; 
    v_reg uuid; 
    v_blocked boolean; 
    v_max_pos int;
BEGIN
  -- Bloquear o evento para evitar condições de corrida
  PERFORM public.lock_event(p_event_id);
  
  -- Buscar o evento
  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN 
    RAISE EXCEPTION 'event_not_found'; 
  END IF;

  -- Verificar se o jogador existe e está ativo
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_target_player_id AND active) THEN
    RAISE EXCEPTION 'player_not_available'; 
  END IF;

  -- Verificar se já está inscrito
  IF EXISTS (SELECT 1 FROM public.registrations r
             WHERE r.event_id = p_event_id AND r.player_id = p_target_player_id AND r.cancelled_at IS NULL)
  THEN 
    RAISE EXCEPTION 'already_registered'; 
  END IF;

  -- Verificar bloqueios (se não houver force_override)
  v_blocked := public.internal_is_blocked(p_target_player_id, v_event.event_date, v_event.group_id);
  IF v_blocked AND NOT p_force_override THEN 
    RAISE EXCEPTION 'player_blocked'; 
  END IF;

  -- Determinar a ÚLTIMA posição global (independente de ser titular ou reserva)
  -- Para garantir que entre no FINAL da lista atual.
  SELECT coalesce(max(position_number), 0) INTO v_max_pos 
  FROM public.registrations 
  WHERE event_id = p_event_id AND cancelled_at IS NULL;
  
  v_pos := v_max_pos + 1;

  -- Inserir a inscrição
  INSERT INTO public.registrations (
    event_id, 
    player_id, 
    registered_by_player_id, 
    list_type, 
    position_number,
    registration_source
  )
  VALUES (
    p_event_id, 
    p_target_player_id, 
    p_target_player_id, 
    p_list_type, 
    v_pos,
    p_registration_source
  )
  RETURNING id INTO v_reg;

  -- Garantir que o jogador tenha o vínculo com a turma
  INSERT INTO public.player_groups (player_id, group_id, status) 
  VALUES (p_target_player_id, v_event.group_id, 'approved')
  ON CONFLICT (player_id, group_id) DO UPDATE SET status = 'approved' WHERE player_groups.status != 'approved';

  -- Logar a ação administrativa
  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (
    p_admin_user_id,
    'admin_add_player',
    'registration', 
    v_reg,
    jsonb_build_object(
      'event_id', p_event_id,
      'player_id', p_target_player_id,
      'list_type', p_list_type,
      'force', p_force_override,
      'group_id', v_event.group_id
    )
  );

  out_registration_id := v_reg; 
  out_list_type := p_list_type; 
  out_position_number := v_pos; 
  RETURN NEXT;
END;
$function$;