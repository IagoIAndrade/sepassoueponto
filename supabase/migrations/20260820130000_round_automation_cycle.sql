-- 1. Refatorar a criação de evento para uma função interna reutilizável
CREATE OR REPLACE FUNCTION public.internal_create_next_event(p_group_id uuid, p_admin_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_calc jsonb;
  v_settings jsonb;
  v_next_date date;
  v_opens_at timestamptz;
  v_start time; v_end time; v_loc text; v_limit int; v_tz text; v_new_id uuid;
  v_wd_weekday int; v_wd_time time; v_pen_late int; v_pen_noshow int;
  v_show_rules boolean; v_priority int;
BEGIN
  v_calc := public.internal_compute_next_round(p_group_id);

  IF COALESCE(v_calc->>'status','') <> 'ok' THEN
    RETURN v_calc;
  END IF;

  v_settings := v_calc->'settings';
  v_next_date := (v_calc->>'next_date')::date;
  v_opens_at  := (v_calc->>'opens_at')::timestamptz;

  IF v_next_date IS NULL OR v_opens_at IS NULL THEN
    RETURN jsonb_build_object('status','invalid_settings','message','Não foi possível calcular a data da próxima rodada.');
  END IF;

  v_start := (v_settings->>'start_time')::time;
  v_end   := (v_settings->>'end_time')::time;
  v_loc   := v_settings->>'location';
  v_limit := (v_settings->>'main_limit')::int;
  v_tz    := COALESCE(v_settings->>'timezone','America/Sao_Paulo');

  v_wd_weekday := (v_settings->>'withdrawal_deadline_weekday')::int;
  v_wd_time    := (v_settings->>'withdrawal_deadline_time')::time;
  v_pen_late   := (v_settings->>'penalty_late_leave')::int;
  v_pen_noshow := (v_settings->>'penalty_no_show')::int;
  v_show_rules := (v_settings->>'show_rules_to_players')::boolean;
  v_priority   := (v_settings->>'priority_minutes')::int;

  BEGIN
    INSERT INTO public.volleyball_events
      (group_id, event_date, opens_at, status, location, start_time, end_time, main_limit, timezone, manual_override,
       withdrawal_deadline_weekday, withdrawal_deadline_time, penalty_late_leave, penalty_no_show,
       show_rules_to_players, priority_minutes)
    VALUES
      (p_group_id, v_next_date, v_opens_at, 'scheduled', v_loc, v_start, v_end, v_limit, v_tz, false,
       v_wd_weekday, v_wd_time, v_pen_late, v_pen_noshow, v_show_rules, v_priority)
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status','already_exists','event_date', v_next_date);
  END;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_id, 
          CASE WHEN p_admin_id IS NULL THEN 'AUTO_ROUND_CREATE' ELSE 'admin_create_next_event_v2' END, 
          'event', v_new_id,
          jsonb_build_object('event_date', v_next_date,'opens_at', v_opens_at,'group_id', p_group_id));

  RETURN jsonb_build_object(
    'status','created',
    'group_id', p_group_id,
    'event', jsonb_build_object(
      'id', v_new_id,
      'event_date', v_next_date,
      'opens_at', v_opens_at,
      'status','scheduled'
    )
  );
END;
$$;

-- 2. Atualizar a RPC admin_create_next_event_v2 para usar a função interna
CREATE OR REPLACE FUNCTION public.admin_create_next_event_v2(p_group_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_gid uuid := COALESCE(p_group_id, public.internal_default_group_id());
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin,'admin') THEN
    RETURN jsonb_build_object('status','unauthorized');
  END IF;

  RETURN public.internal_create_next_event(v_gid, v_admin);
END;
$$;

-- 3. Criar a função principal do ciclo de automação
CREATE OR REPLACE FUNCTION public.internal_cycle_rounds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group record;
  v_event record;
  v_today date;
  v_timezone text;
  v_closed_count int := 0;
  v_created_count int := 0;
  v_res jsonb;
BEGIN
  -- A automação roda em UTC, mas as datas são SP
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  -- A. ENCERRAMENTO (Reconciliação)
  FOR v_event IN
    SELECT id, event_date, status, group_id
    FROM public.volleyball_events
    WHERE event_date < v_today
      AND status IN ('scheduled', 'open', 'closed')
  LOOP
    UPDATE public.volleyball_events
    SET status = 'completed'
    WHERE id = v_event.id;
    
    INSERT INTO public.admin_actions_log (action, target_type, target_id, details)
    VALUES ('AUTO_ROUND_CLOSE', 'event', v_event.id, 
            jsonb_build_object('event_date', v_event.event_date, 'previous_status', v_event.status));
            
    v_closed_count := v_closed_count + 1;
  END LOOP;

  -- B. CRIAÇÃO AUTOMÁTICA
  FOR v_group IN
    SELECT id, name
    FROM public.groups
    ORDER BY sort_order
  LOOP
    -- Se não existir nenhuma rodada ativa futura (>= hoje)
    IF NOT EXISTS (
      SELECT 1 FROM public.volleyball_events
      WHERE group_id = v_group.id
        AND event_date >= v_today
        AND status IN ('scheduled', 'open', 'closed')
    ) THEN
      v_res := public.internal_create_next_event(v_group.id);
      IF v_res->>'status' = 'created' THEN
        v_created_count := v_created_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- C. ABERTURA (Garantir que as aberturas pendentes sejam processadas)
  PERFORM public.internal_process_due_event_openings();

  RETURN jsonb_build_object(
    'ok', true,
    'closed', v_closed_count,
    'created', v_created_count,
    'executed_at', now()
  );
END;
$$;

-- 4. Configurar o agendamento Cron
-- Tenta remover se já existir para evitar duplicidade de logs
SELECT cron.unschedule('round_cycling_job');
SELECT cron.schedule('round_cycling_job', '1 * * * *', 'SELECT public.internal_cycle_rounds()');

GRANT EXECUTE ON FUNCTION public.internal_cycle_rounds() TO service_role;
GRANT EXECUTE ON FUNCTION public.internal_create_next_event(uuid, uuid) TO service_role;
