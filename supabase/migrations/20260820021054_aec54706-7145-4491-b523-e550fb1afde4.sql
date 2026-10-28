DROP FUNCTION IF EXISTS public.get_public_current_event(UUID);
DROP FUNCTION IF EXISTS public.get_current_event_id(UUID);

CREATE OR REPLACE FUNCTION public.get_current_event_id(p_group_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT e.id
    FROM public.volleyball_events e
    LEFT JOIN public.app_settings s ON s.group_id = e.group_id
    WHERE e.group_id = p_group_id
      AND e.event_date >= (CURRENT_DATE AT TIME ZONE COALESCE(s.timezone, 'America/Sao_Paulo'))::date
      AND e.status NOT IN ('completed', 'cancelled')
    ORDER BY e.event_date ASC
    LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_current_event(p_group_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    event_date DATE,
    opens_at TIMESTAMPTZ,
    closes_at TIMESTAMPTZ,
    status public.event_status,
    location TEXT,
    start_time TIME,
    end_time TIME,
    main_limit INTEGER,
    priority_minutes INTEGER,
    group_id UUID
) 
LANGUAGE sql
STABLE
AS $$
    SELECT e.id, e.event_date, e.opens_at, e.closes_at, e.status, 
           e.location, e.start_time, e.end_time, e.main_limit, 
           COALESCE(e.priority_minutes, s.priority_minutes), e.group_id
    FROM public.volleyball_events e
    LEFT JOIN public.app_settings s ON s.group_id = e.group_id
    WHERE e.id = public.get_current_event_id(COALESCE(p_group_id, public.internal_default_group_id()));
$$;

GRANT EXECUTE ON FUNCTION public.get_current_event_id(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_current_event(UUID) TO anon, authenticated, service_role;