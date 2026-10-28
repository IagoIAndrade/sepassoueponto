
CREATE OR REPLACE FUNCTION public.tick_events()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  s public.app_settings;
  v_today  date;
  v_next_event_date date;
  v_opens  timestamptz;
  v_dow    int;
  v_delta  int;
BEGIN
  SELECT * INTO s FROM public.app_settings ORDER BY created_at ASC LIMIT 1;
  IF s.id IS NULL THEN RETURN; END IF;

  v_today := (now() AT TIME ZONE s.timezone)::date;
  v_dow := EXTRACT(DOW FROM v_today)::int;
  v_delta := (s.event_weekday - v_dow + 7) % 7;
  v_next_event_date := v_today + v_delta;

  -- opens_at: 5 dias antes do jogo, no horário s.open_time no fuso configurado.
  -- Precisa ser feito em UMA expressão para o AT TIME ZONE atuar sobre um
  -- timestamp sem fuso; caso contrário o valor é coagido a UTC antes.
  v_opens := ((v_next_event_date - 5)::timestamp + s.open_time) AT TIME ZONE s.timezone;

  INSERT INTO public.volleyball_events
    (event_date, opens_at, status, location, start_time, end_time, main_limit, timezone)
  VALUES (v_next_event_date, v_opens, 'scheduled', s.location, s.start_time, s.end_time, s.main_limit, s.timezone)
  ON CONFLICT (event_date) DO NOTHING;

  UPDATE public.volleyball_events
     SET status = 'open'
   WHERE status = 'scheduled' AND manual_override = false AND opens_at <= now();
END; $function$;

-- Corrige o opens_at do evento existente (22/07/2026): 17/07/2026 12:00 BRT = 15:00 UTC
UPDATE public.volleyball_events
   SET opens_at = ((event_date - 5)::timestamp + '12:00'::time) AT TIME ZONE COALESCE(timezone,'America/Sao_Paulo')
 WHERE status IN ('scheduled','open','closed');
