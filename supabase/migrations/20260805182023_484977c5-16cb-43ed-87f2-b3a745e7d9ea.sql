-- 1. Drop das funções para recriar com a nova lógica (necessário devido a parâmetros default e mudanças de assinatura implícitas)
DROP FUNCTION IF EXISTS public.internal_compute_next_round(uuid);

-- 2. Recriar internal_compute_next_round com lógica robusta e tratamento de timezone
CREATE OR REPLACE FUNCTION public.internal_compute_next_round(p_group_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s public.app_settings;
  v_gid uuid := COALESCE(p_group_id, public.internal_default_group_id());
  v_today date; 
  v_current_id uuid; 
  v_current_date date;
  v_next_existing_id uuid; 
  v_next_existing_date date;
  v_base date; 
  v_delta int; 
  v_next_date date; 
  v_delta_back int; 
  v_open_date date; 
  v_opens_at timestamptz;
  v_dow_base int;
  v_timezone text;
BEGIN
  -- 1. Buscar configurações do grupo
  SELECT * INTO s FROM public.app_settings WHERE group_id = v_gid LIMIT 1;
  IF s.id IS NULL THEN 
    RETURN jsonb_build_object('status','invalid_settings', 'message', 'Configurações não encontradas para este grupo.'); 
  END IF;

  v_timezone := COALESCE(s.timezone, 'America/Sao_Paulo');

  -- 2. Data "hoje" no fuso do grupo
  v_today := (now() AT TIME ZONE v_timezone)::date;

  -- 3. Buscar a rodada ativa mais próxima (scheduled, open, closed) que ainda não passou
  SELECT e.id, e.event_date INTO v_current_id, v_current_date
  FROM public.volleyball_events e
  WHERE e.group_id = v_gid 
    AND e.status IN ('scheduled','open','closed') 
    AND e.event_date >= v_today
  ORDER BY e.event_date ASC LIMIT 1;

  -- 4. Determinar a data base para o cálculo
  IF v_current_id IS NOT NULL THEN
    -- Se já tem uma rodada ativa, vamos calcular a partir dela
    v_base := v_current_date;
    
    -- Verificar se já existe uma rodada DEPOIS desta
    SELECT e.id, e.event_date INTO v_next_existing_id, v_next_existing_date
    FROM public.volleyball_events e
    WHERE e.group_id = v_gid 
      AND e.status IN ('scheduled','open','closed') 
      AND e.event_date > v_current_date
    ORDER BY e.event_date ASC LIMIT 1;
  ELSE
    -- Se não tem nenhuma rodada ativa, calcula a partir de "ontem" para tentar achar a desta semana
    v_base := v_today - 1;
  END IF;

  -- 5. Calcular a próxima data de evento (respeitando o event_weekday do grupo)
  -- EXTRACT(DOW) retorna 0 (Dom) a 6 (Sab).
  v_dow_base := EXTRACT(DOW FROM v_base)::int;
  
  -- Cálculo de delta para o próximo dia da semana alvo
  -- Se hoje é o dia do evento, mas a rodada já passou ou estamos criando a próxima, 
  -- o delta deve ser 7 para pular para a próxima semana.
  v_delta := ((s.event_weekday - v_dow_base + 6) % 7) + 1;
  v_next_date := v_base + v_delta;

  -- 6. Calcular data e hora de abertura
  v_delta_back := ((EXTRACT(DOW FROM v_next_date)::int - s.open_weekday + 7) % 7);
  IF v_delta_back = 0 THEN v_delta_back := 7; END IF;
  
  v_open_date := v_next_date - v_delta_back;
  v_opens_at := ((v_open_date::timestamp + s.open_time) AT TIME ZONE v_timezone);

  RETURN jsonb_build_object(
    'status', CASE WHEN v_next_existing_id IS NOT NULL THEN 'blocked_by_existing_next_event' ELSE 'ready' END,
    'group_id', v_gid,
    'today', v_today,
    'base_date', v_base,
    'current', CASE WHEN v_current_id IS NOT NULL THEN jsonb_build_object('id', v_current_id,'event_date', v_current_date) ELSE NULL END,
    'next_existing', CASE WHEN v_next_existing_id IS NOT NULL THEN jsonb_build_object('id', v_next_existing_id,'event_date', v_next_existing_date) ELSE NULL END,
    'computed', jsonb_build_object(
      'event_date', v_next_date, 
      'opens_at', v_opens_at, 
      'start_time', s.start_time, 
      'end_time', s.end_time,
      'location', s.location, 
      'main_limit', s.main_limit, 
      'timezone', v_timezone,
      'event_weekday', s.event_weekday, 
      'open_weekday', s.open_weekday, 
      'open_time', s.open_time
    )
  );
END;
$$;

-- 3. Recriar admin_create_next_event_v2 para usar a nova lógica
CREATE OR REPLACE FUNCTION public.admin_create_next_event_v2(p_group_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_gid uuid := COALESCE(p_group_id, public.internal_default_group_id());
  v_calc jsonb; 
  v_next_date date; 
  v_opens_at timestamptz;
  v_start time; v_end time; v_loc text; v_limit int; v_tz text; v_new_id uuid;
  v_wd_weekday int; v_wd_time time; v_pen_late int; v_pen_noshow int;
  v_show_rules boolean; v_priority int;
BEGIN
  -- Validação de Admin
  IF v_admin IS NULL OR NOT public.has_role(v_admin,'admin') THEN
    RETURN jsonb_build_object('status','unauthorized');
  END IF;

  -- Calcular próxima rodada
  v_calc := public.internal_compute_next_round(v_gid);
  
  IF v_calc->>'status' = 'invalid_settings' THEN 
    RETURN v_calc; 
  END IF;
  
  -- Se houver bloqueio por rodada futura, retornamos o erro para a UI
  IF v_calc->>'status' = 'blocked_by_existing_next_event' THEN 
    RETURN v_calc; 
  END IF;

  v_next_date := (v_calc->'computed'->>'event_date')::date;
  v_opens_at  := (v_calc->'computed'->>'opens_at')::timestamptz;
  v_start := (v_calc->'computed'->>'start_time')::time;
  v_end   := (v_calc->'computed'->>'end_time')::time;
  v_loc   := v_calc->'computed'->>'location';
  v_limit := (v_calc->'computed'->>'main_limit')::int;
  v_tz    := v_calc->'computed'->>'timezone';

  -- Buscar dados restantes das configurações
  SELECT withdrawal_deadline_weekday, withdrawal_deadline_time, penalty_late_leave, penalty_no_show,
         show_rules_to_players, priority_minutes
    INTO v_wd_weekday, v_wd_time, v_pen_late, v_pen_noshow, v_show_rules, v_priority
  FROM public.app_settings WHERE group_id = v_gid;

  BEGIN
    INSERT INTO public.volleyball_events
      (group_id, event_date, opens_at, status, location, start_time, end_time, main_limit, timezone, manual_override,
       withdrawal_deadline_weekday, withdrawal_deadline_time, penalty_late_leave, penalty_no_show,
       show_rules_to_players, priority_minutes)
    VALUES
      (v_gid, v_next_date, v_opens_at, 'scheduled', v_loc, v_start, v_end, v_limit, v_tz, false,
       v_wd_weekday, v_wd_time, v_pen_late, v_pen_noshow, v_show_rules, v_priority)
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status','already_exists','event_date', v_next_date);
  END;

  -- Log de auditoria
  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_admin,'admin_create_next_event_v2','event', v_new_id,
          jsonb_build_object('event_date', v_next_date,'opens_at', v_opens_at,'group_id', v_gid));

  RETURN jsonb_build_object(
    'status','created',
    'group_id', v_gid,
    'event', jsonb_build_object(
      'id', v_new_id,
      'event_date', v_next_date,
      'opens_at', v_opens_at,
      'start_time', v_start,
      'end_time', v_end,
      'location', v_loc,
      'main_limit', v_limit,
      'priority_minutes', v_priority,
      'status','scheduled'
    )
  );
END;
$$;

-- 4. Garantir permissões de execução
GRANT EXECUTE ON FUNCTION public.internal_compute_next_round(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_next_event_v2(uuid) TO authenticated;
