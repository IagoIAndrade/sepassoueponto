-- Adicionando colunas de configuração real por turma na tabela app_settings
ALTER TABLE public.app_settings 
ADD COLUMN IF NOT EXISTS list_open_time TIME DEFAULT '18:00',
ADD COLUMN IF NOT EXISTS priority_start_time TIME DEFAULT '17:30',
ADD COLUMN IF NOT EXISTS auto_promote_reservations BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS auto_generate_incidents BOOLEAN DEFAULT true;

-- Garantir permissões
GRANT SELECT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

-- Comentários para documentação do schema
COMMENT ON COLUMN public.app_settings.list_open_time IS 'Horário de abertura da lista para o público geral.';
COMMENT ON COLUMN public.app_settings.priority_start_time IS 'Horário de início da prioridade para jogadores "Em Dia".';
COMMENT ON COLUMN public.app_settings.withdrawal_deadline_time IS 'Horário limite para remover nome sem penalidade.';
COMMENT ON COLUMN public.app_settings.auto_promote_reservations IS 'Se ativado, promove automaticamente o reserva ao haver desistência.';
COMMENT ON COLUMN public.app_settings.auto_generate_incidents IS 'Se ativado, gera ocorrência automática para saídas após o horário limite.';

-- Atualizar a função de remoção para lidar com a regra automática de ocorrência
CREATE OR REPLACE FUNCTION public.internal_leave_registration_v2(
  p_registration_id uuid,
  p_player_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_group_id uuid;
  v_event_date date;
  v_deadline_time time;
  v_deadline_weekday int;
  v_now timestamp;
  v_deadline_timestamp timestamp;
  v_auto_incident boolean;
BEGIN
  -- 1. Obter dados da inscrição e regras do grupo
  SELECT 
    r.event_id, 
    e.group_id, 
    e.event_date,
    s.withdrawal_deadline_time,
    s.withdrawal_deadline_weekday,
    s.auto_generate_incidents
  INTO 
    v_event_id, 
    v_group_id, 
    v_event_date,
    v_deadline_time,
    v_deadline_weekday,
    v_auto_incident
  FROM public.registrations r
  JOIN public.volleyball_events e ON e.id = r.event_id
  JOIN public.app_settings s ON s.group_id = e.group_id
  WHERE r.id = p_registration_id AND r.player_id = p_player_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'Inscrição não encontrada');
  END IF;

  v_now := now() AT TIME ZONE 'America/Sao_Paulo';
  
  -- Calcular o timestamp do deadline na data do evento ou dia anterior conforme configurado
  v_deadline_timestamp := (v_event_date - (extract(dow from v_event_date)::int - v_deadline_weekday) * interval '1 day')::date + v_deadline_time;

  -- 2. Verificar se deve gerar ocorrência automática
  IF v_auto_incident AND v_now > v_deadline_timestamp THEN
    INSERT INTO public.incidents (
      player_id,
      group_id,
      event_id,
      type,
      description,
      status,
      created_at
    ) VALUES (
      p_player_id,
      v_group_id,
      v_event_id,
      'Retirada fora do prazo',
      'Jogador removeu o nome após o horário limite permitido (' || v_deadline_time::text || ').',
      'pending',
      v_now
    );
  END IF;

  -- 3. Remover a inscrição
  UPDATE public.registrations
  SET cancelled_at = v_now
  WHERE id = p_registration_id;

  RETURN json_build_object('ok', true);
END;
$$;
