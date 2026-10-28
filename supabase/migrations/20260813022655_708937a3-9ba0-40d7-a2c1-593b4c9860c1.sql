-- Corrigir assinatura da função e adicionar notificações
DROP FUNCTION IF EXISTS public.internal_leave_registration_v2(uuid,uuid,boolean);

-- Atualizar enum de notificações
DO $$ BEGIN
    ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'registration_confirmed';
    ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'waitlist_joined';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Atualizar internal_join_event para criar notificações
CREATE OR REPLACE FUNCTION public.internal_join_event(p_event_id uuid, p_target_player_id uuid, p_responsible_player_id uuid, p_force_override boolean DEFAULT false)
 RETURNS TABLE(out_registration_id uuid, out_list_type list_type, out_position_number integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_event public.volleyball_events;
  v_target public.players;
  v_resp_cnt int; v_main_cnt int; v_pos int;
  v_list public.list_type; v_reg_id uuid;
  v_blocked boolean; v_priority_end timestamptz; v_remaining int;
  v_paid_up boolean; v_priority_minutes int;
  v_event_name text;
BEGIN
  PERFORM public.lock_event(p_event_id);
  
  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF v_event.status <> 'open' THEN RAISE EXCEPTION 'event_not_open'; END IF;

  IF v_event.opens_at IS NULL OR v_event.opens_at > now() THEN
    UPDATE public.volleyball_events SET opens_at = now() WHERE id = p_event_id;
    SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  END IF;

  SELECT * INTO v_target FROM public.players WHERE id = p_target_player_id;
  IF v_target.id IS NULL OR NOT v_target.active THEN RAISE EXCEPTION 'player_not_available'; END IF;

  v_blocked := public.internal_is_blocked(p_target_player_id, v_event.event_date);
  IF v_blocked AND NOT p_force_override THEN RAISE EXCEPTION 'player_blocked'; END IF;

  IF EXISTS (SELECT 1 FROM public.registrations r
             WHERE r.event_id = p_event_id AND r.player_id = p_target_player_id AND r.cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'already_registered';
  END IF;

  v_priority_minutes := v_event.priority_minutes;
  IF v_priority_minutes IS NULL THEN
    SELECT priority_minutes INTO v_priority_minutes FROM public.app_settings WHERE group_id = v_event.group_id;
  END IF;
  v_priority_minutes := COALESCE(v_priority_minutes, 0);
  
  v_priority_end := v_event.opens_at + (v_priority_minutes * interval '1 minute');

  v_paid_up := public.player_is_paid_up(p_target_player_id, v_event.group_id);

  SELECT count(*)::int INTO v_main_cnt FROM public.registrations
  WHERE event_id = p_event_id AND list_type = 'main' AND cancelled_at IS NULL;

  IF v_main_cnt < v_event.main_limit THEN
    IF now() > v_priority_end OR v_paid_up THEN
      v_list := 'main';
    ELSE
      v_list := 'wait';
    END IF;
  ELSE
    v_list := 'wait';
  END IF;

  SELECT COALESCE(max(position_number), 0) + 1 INTO v_pos
  FROM public.registrations
  WHERE event_id = p_event_id AND list_type = v_list AND cancelled_at IS NULL;

  INSERT INTO public.registrations (
    event_id, player_id, list_type, position_number, responsible_player_id
  ) VALUES (
    p_event_id, p_target_player_id, v_list, v_pos, p_responsible_player_id
  ) RETURNING id INTO v_reg_id;

  -- Criar notificação
  SELECT g.name INTO v_event_name FROM public.groups g WHERE g.id = v_event.group_id;
  
  IF v_list = 'main' THEN
    INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
    VALUES (
      p_target_player_id, 
      'registration_confirmed', 
      v_event.group_id, 
      p_event_id, 
      jsonb_build_object('message', 'Você entrou na Lista Principal de ' || v_event_name || '.'),
      'reg-conf-' || p_target_player_id || '-' || p_event_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  ELSE
    INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
    VALUES (
      p_target_player_id, 
      'waitlist_joined', 
      v_event.group_id, 
      p_event_id, 
      jsonb_build_object('message', 'No momento você está em ' || v_pos || 'º lugar na fila de espera de ' || v_event_name || '.'),
      'reg-wait-' || p_target_player_id || '-' || p_event_id
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  RETURN QUERY SELECT v_reg_id, v_list, v_pos;
END;
$function$;

-- Refatorar internal_leave_registration_v2 para versão V3 com promoção automática
CREATE OR REPLACE FUNCTION public.internal_leave_registration_v2(
  p_registration_id uuid,
  p_player_id uuid,
  p_confirm_late_leave boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  -- 1. Obter dados da inscrição e bloquear rodada
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
  
  -- Cálculo simplificado do deadline
  v_deadline_timestamp := (v_event.event_date - (extract(dow from v_event.event_date)::int - v_deadline_weekday) * interval '1 day')::date + v_deadline_time;
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
  IF v_is_late AND v_auto_incident THEN
    INSERT INTO public.incidents (
      player_id, group_id, event_id, type, description, status, created_at
    ) VALUES (
      p_player_id, v_group_id, v_reg.event_id, 'Retirada fora do prazo', 
      'Jogador removeu o nome após o horário limite (' || v_deadline_time::text || ').', 
      'pending', v_now
    );
  END IF;

  -- 4. Cancelar inscrição
  UPDATE public.registrations SET cancelled_at = v_now WHERE id = p_registration_id;

  -- 5. PROMOÇÃO AUTOMÁTICA
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
      -- Promove o reserva
      UPDATE public.registrations
      SET list_type = 'main',
          position_number = (
            SELECT COALESCE(max(position_number), 0) + 1 
            FROM public.registrations 
            WHERE event_id = v_reg.event_id AND list_type = 'main' AND cancelled_at IS NULL
          ),
          metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{promoted_at}', to_jsonb(v_now::text))
      WHERE id = v_next_wait_id;

      -- Notificação 'promoted_to_main' será disparada pelo trigger trg_notify_promotion existente
    END IF;
  END IF;

  RETURN json_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v2(uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_join_event(uuid,uuid,uuid,boolean) TO authenticated;
