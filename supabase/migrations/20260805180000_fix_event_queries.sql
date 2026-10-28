CREATE OR REPLACE FUNCTION public.internal_compute_next_round(p_group_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    -- Verificar se já existe uma rodada ATIVA (não finalizada) DEPOIS desta
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

  -- 5. Se já existe uma rodada futura ATIVA, bloqueamos a criação de outra
  IF v_next_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'blocked_by_existing_next_event', 
      'message', 'Já existe uma rodada futura programada.',
      'event_id', v_next_existing_id,
      'event_date', v_next_existing_date
    );
  END IF;

  -- 6. Calcular a próxima data baseada no event_weekday (dia da semana configurado)
  v_dow_base := extract(dow from v_base); -- 0=dom, 1=seg, 2=ter, 3=qua, 4=qui, 5=sex, 6=sab
  
  -- v_delta: quantos dias faltam para chegar no s.event_weekday
  v_delta := (s.event_weekday - v_dow_base + 7) % 7;
  IF v_delta = 0 THEN v_delta := 7; END IF;
  
  v_next_date := v_base + v_delta;

  -- 7. Verificar se já existe QUALQUER rodada nesta data (mesmo que finalizada/cancelada)
  -- Se estiver finalizada, vamos pular +7 dias até achar uma data livre
  WHILE EXISTS (SELECT 1 FROM public.volleyball_events WHERE group_id = v_gid AND event_date = v_next_date) LOOP
    -- Se for uma rodada ativa (scheduled/open/closed), retornamos error de duplicidade
    IF EXISTS (SELECT 1 FROM public.volleyball_events WHERE group_id = v_gid AND event_date = v_next_date AND status IN ('scheduled','open','closed')) THEN
       RETURN jsonb_build_object(
         'status', 'already_exists', 
         'event_date', v_next_date,
         'message', 'Já existe uma rodada ativa para esta data.'
       );
    END IF;
    
    -- Se chegamos aqui, a rodada existe mas está completed/cancelled. Pula para a próxima semana.
    v_next_date := v_next_date + 7;
  END LOOP;

  -- 8. Calcular data/hora de abertura
  v_delta_back := (extract(dow from v_next_date)::int - s.open_weekday + 7) % 7;
  v_open_date := v_next_date - v_delta_back;
  v_opens_at := (v_open_date::text || ' ' || s.open_time::text)::timestamp AT TIME ZONE v_timezone;

  RETURN jsonb_build_object(
    'status', 'ok',
    'next_date', v_next_date,
    'opens_at', v_opens_at,
    'settings', row_to_json(s)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_public_current_event(p_group_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, event_date date, opens_at timestamp with time zone, closes_at timestamp with time zone, status event_status, location text, start_time time without time zone, end_time time without time zone, main_limit integer, priority_minutes integer, group_id uuid)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
   SELECT e.id, e.event_date, e.opens_at, e.closes_at, e.status, 
          e.location, e.start_time, e.end_time, e.main_limit, 
          COALESCE(e.priority_minutes, s.priority_minutes), e.group_id
   FROM public.volleyball_events e
   LEFT JOIN public.app_settings s ON s.group_id = e.group_id
   WHERE e.group_id = COALESCE(p_group_id, public.internal_default_group_id())
     AND e.status IN ('scheduled','open','closed')
   ORDER BY e.event_date ASC
   LIMIT 1;
$function$;
