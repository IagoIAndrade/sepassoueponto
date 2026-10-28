-- Corrigir a RPC internal_leave_registration_v2 para usar 'justification' em vez de 'description'
-- e garantir atomicidade total na promoção de reservas.
CREATE OR REPLACE FUNCTION public.internal_leave_registration_v2(
  p_registration_id uuid, 
  p_player_id uuid, 
  p_confirm_late_leave boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_reg public.registrations;
  v_event public.volleyball_events;
  v_group_id uuid;
  v_now timestamp;
  v_deadline_time time;
  v_deadline_weekday int;
  v_deadline_timestamp timestamp;
  v_auto_incident boolean;
  v_is_late boolean;
  v_next_wait_id uuid;
  v_next_player_id uuid;
BEGIN
  -- 1. Obter dados da inscrição e bloquear linha para atomicidade
  SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id FOR UPDATE;
  
  IF v_reg.id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'Inscrição não encontrada');
  END IF;

  IF v_reg.player_id != p_player_id THEN
    RETURN json_build_object('ok', false, 'error', 'Não autorizado');
  END IF;

  IF v_reg.cancelled_at IS NOT NULL THEN
    RETURN json_build_object('ok', true); -- Já saiu
  END IF;

  -- Bloquear o evento para evitar race conditions na lista
  PERFORM public.lock_event(v_reg.event_id);

  SELECT * INTO v_event FROM public.volleyball_events WHERE id = v_reg.event_id;
  SELECT group_id INTO v_group_id FROM public.volleyball_events WHERE id = v_reg.event_id;

  -- 2. Checar prazo
  SELECT 
    withdrawal_deadline_time, 
    withdrawal_deadline_weekday,
    auto_generate_incidents
  INTO 
    v_deadline_time, 
    v_deadline_weekday, 
    v_auto_incident
  FROM public.app_settings
  WHERE group_id = v_group_id;

  v_now := now() AT TIME ZONE 'America/Sao_Paulo';

  -- Cálculo do deadline baseado no dia da semana e horário configurado
  v_deadline_timestamp := (v_event.event_date - (extract(dow from v_event.event_date)::int - v_deadline_weekday + 7) % 7 * interval '1 day')::date + v_deadline_time;

  v_is_late := v_now > v_deadline_timestamp;

  IF v_is_late AND NOT p_confirm_late_leave THEN
    RETURN json_build_object(
      'ok', false,
      'status', 'late_leave_confirmation_required',
      'deadline_at', v_deadline_timestamp,
      'timezone', 'America/Sao_Paulo'
    );
  END IF;

  -- 3. Gerar ocorrência se fora do prazo
  -- CORREÇÃO: Usando 'justification' (coluna real) em vez de 'description'
  IF v_is_late AND v_auto_incident THEN
    INSERT INTO public.player_incidents (
      player_id, group_id, event_id, incident_type, justification, status, occurred_at, created_at
    ) VALUES (
      p_player_id, v_group_id, v_reg.event_id, 'Retirada fora do prazo',
      'Jogador removeu o nome após o horário limite (' || v_deadline_time::text || ').',
      'pending', v_now, v_now
    );
  END IF;

  -- 4. Cancelar inscrição
  UPDATE public.registrations SET cancelled_at = v_now WHERE id = p_registration_id;

  -- 5. PROMOÇÃO AUTOMÁTICA ATÔMICA
  -- Se o jogador que saiu era da lista principal
  IF v_reg.list_type = 'main' THEN
    -- Busca o próximo reserva ativo ordenado por created_at ASC
    SELECT id, player_id INTO v_next_wait_id, v_next_player_id
    FROM public.registrations
    WHERE event_id = v_reg.event_id
      AND list_type = 'wait'
      AND cancelled_at IS NULL
    ORDER BY created_at ASC
    LIMIT 1;

    IF v_next_wait_id IS NOT NULL THEN
      -- Promove o reserva para a lista principal
      UPDATE public.registrations 
      SET list_type = 'main',
          position_number = (SELECT COALESCE(MAX(position_number), 0) + 1 FROM public.registrations WHERE event_id = v_reg.event_id AND list_type = 'main' AND cancelled_at IS NULL)
      WHERE id = v_next_wait_id;
    END IF;
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

-- Garantir permissões de execução
GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v2(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v2(uuid, uuid, boolean) TO service_role;
