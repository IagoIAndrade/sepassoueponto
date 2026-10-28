-- Fix get_public_current_event to never return past or completed events.
CREATE OR REPLACE FUNCTION public.get_public_current_event()
 RETURNS TABLE(id uuid, event_date date, opens_at timestamp with time zone, closes_at timestamp with time zone, status event_status, location text, start_time time without time zone, end_time time without time zone, main_limit integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT e.id, e.event_date, e.opens_at, e.closes_at, e.status,
         e.location, e.start_time, e.end_time, e.main_limit
  FROM public.volleyball_events e
  WHERE e.status IN ('scheduled','open','closed')
    AND e.event_date >= (now() AT TIME ZONE COALESCE(e.timezone,'America/Sao_Paulo'))::date
  ORDER BY e.event_date ASC
  LIMIT 1;
$function$;