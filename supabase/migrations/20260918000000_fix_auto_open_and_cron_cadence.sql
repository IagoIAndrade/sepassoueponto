-- Migration: Corrige abertura automática e cadência do cron
-- 1. Ajusta pg_cron round_cycling_job para cada minuto chamando internal_cycle_rounds diretamente
-- 2. Reescreve get_public_current_event para delegar abertura ao internal_process_event_opening
-- 3. Mantém contratos públicos intactos e casts estritos de enum

------------------------------------------------------------------------
-- 1. CRON: Periodicidade unificada sem duplicação
------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    BEGIN
      PERFORM cron.unschedule('round_cycling_job');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule('round_cycling_job', '* * * * *', 'SELECT public.internal_cycle_rounds()');
  ELSE
    RAISE NOTICE 'cron schema not present; round_cycling_job schedule kept untouched';
  END IF;
END;
$$;

------------------------------------------------------------------------
-- 2. get_public_current_event: delegar abertura ao fluxo oficial
------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_current_event(p_group_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(
  id uuid,
  event_date date,
  opens_at timestamp with time zone,
  closes_at timestamp with time zone,
  status public.event_status,
  location text,
  start_time time without time zone,
  end_time time without time zone,
  main_limit integer,
  priority_minutes integer,
  group_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_group_id uuid := COALESCE(p_group_id, public.internal_default_group_id());
  v_event public.volleyball_events%ROWTYPE;
  v_settings public.app_settings%ROWTYPE;
  v_today date;
  v_close_date date;
  v_close_delta integer;
  v_open_result json;
BEGIN
  IF v_group_id IS NULL THEN
    RETURN;
  END IF;

  SELECT *
  INTO v_settings
  FROM public.app_settings s
  WHERE s.group_id = v_group_id
  LIMIT 1;

  v_today := (now() AT TIME ZONE COALESCE(v_settings.timezone, 'America/Sao_Paulo'))::date;

  SELECT *
  INTO v_event
  FROM public.volleyball_events e
  WHERE e.group_id = v_group_id
    AND e.event_date >= v_today
    AND e.status IN ('scheduled'::public.event_status, 'open'::public.event_status, 'closed'::public.event_status)
  ORDER BY e.event_date ASC, e.start_time ASC, e.id ASC
  LIMIT 1;

  IF v_event.id IS NULL THEN
    RETURN;
  END IF;

  -- Abertura sob demanda com lock seguro
  IF COALESCE(v_settings.auto_open, true)
     AND v_event.status = 'scheduled'::public.event_status
     AND v_event.opens_at <= now()
     AND COALESCE(v_event.manual_override, false) = false
  THEN
    v_open_result := public.internal_process_event_opening(v_event.id, false);

    IF COALESCE((v_open_result->>'ok')::boolean, false) THEN
      SELECT *
      INTO v_event
      FROM public.volleyball_events e
      WHERE e.id = v_event.id;
    END IF;
  END IF;

  IF v_event.closes_at IS NOT NULL THEN
    closes_at := v_event.closes_at;
  ELSE
    v_close_delta := (
      COALESCE(v_settings.close_weekday, EXTRACT(DOW FROM v_event.event_date)::integer)
      - EXTRACT(DOW FROM v_event.event_date)::integer
      + 7
    ) % 7;
    v_close_date := v_event.event_date + v_close_delta;
    closes_at := (v_close_date::text || ' ' || COALESCE(v_settings.close_time, '23:59:59'::time)::text)::timestamp
      AT TIME ZONE COALESCE(v_settings.timezone, v_event.timezone, 'America/Sao_Paulo');
  END IF;

  id := v_event.id;
  event_date := v_event.event_date;
  opens_at := v_event.opens_at;
  status := v_event.status;
  location := v_event.location;
  start_time := v_event.start_time;
  end_time := v_event.end_time;
  main_limit := v_event.main_limit;
  priority_minutes := COALESCE(v_event.priority_minutes, v_settings.priority_minutes, 0);
  group_id := v_event.group_id;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_current_event(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_public_current_event(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_current_event(uuid) TO service_role;

------------------------------------------------------------------------
-- 3. Validação embutida de integridade
------------------------------------------------------------------------
DO $$
DECLARE
  v_signature text;
BEGIN
  SELECT pg_get_function_result('public.get_public_current_event(uuid)'::regprocedure)
  INTO v_signature;

  IF v_signature IS DISTINCT FROM 'TABLE(id uuid, event_date date, opens_at timestamp with time zone, closes_at timestamp with time zone, status event_status, location text, start_time time without time zone, end_time time without time zone, main_limit integer, priority_minutes integer, group_id uuid)' THEN
    RAISE EXCEPTION 'get_public_current_event signature mismatch: %', v_signature;
  END IF;
END;
$$;
