CREATE OR REPLACE FUNCTION public.internal_get_my_full_history(
    p_player_id uuid,
    p_limit integer DEFAULT 10
)
RETURNS TABLE (
    id uuid,
    list_type public.list_type,
    position_number integer,
    created_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    event_id uuid,
    event_date date,
    event_status public.event_status,
    start_time text,
    group_name text,
    main_limit integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- Validação de segurança rigorosa
    IF p_player_id IS NULL OR p_player_id <> auth.uid() THEN
        RAISE EXCEPTION 'Acesso negado: você só pode consultar seu próprio histórico.';
    END IF;

    RETURN QUERY
    SELECT 
        r.id,
        r.list_type,
        r.position_number,
        r.created_at,
        r.cancelled_at,
        e.id as event_id,
        e.event_date,
        e.status as event_status,
        e.start_time::text,
        g.name as group_name,
        e.main_limit
    FROM public.registrations r
    JOIN public.volleyball_events e ON e.id = r.event_id
    JOIN public.groups g ON g.id = e.group_id
    WHERE r.player_id = p_player_id
    ORDER BY e.event_date DESC, r.created_at DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.internal_get_my_full_history TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_get_my_full_history TO service_role;
REVOKE ALL ON FUNCTION public.internal_get_my_full_history FROM PUBLIC, anon;
