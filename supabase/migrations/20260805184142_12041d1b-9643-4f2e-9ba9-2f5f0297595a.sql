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
      AND e.event_date >= (now() AT TIME ZONE COALESCE(s.timezone, 'America/Sao_Paulo'))::date
      AND e.status IN ('scheduled','open','closed')
    ORDER BY e.event_date ASC
    LIMIT 1;
 $function$;