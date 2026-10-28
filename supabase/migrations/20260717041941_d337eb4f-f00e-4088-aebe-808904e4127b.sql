CREATE OR REPLACE FUNCTION public.internal_search_players(
  p_query text,
  p_session_id uuid,
  p_event_id uuid
)
RETURNS TABLE(id uuid, name text)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_hits int;
  v_q text;
BEGIN
  -- rate limit 30/min por sessão
  SELECT count(*) INTO v_hits
  FROM public.player_search_hits
  WHERE session_id = p_session_id
    AND hit_at > now() - interval '1 minute';

  IF v_hits >= 30 THEN
    RAISE EXCEPTION 'rate_limited';
  END IF;

  INSERT INTO public.player_search_hits (session_id) VALUES (p_session_id);

  v_q := lower(btrim(coalesce(p_query, '')));
  IF length(v_q) < 2 THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT p.id, p.name
    FROM public.players p
    WHERE p.active = true
      AND p.name_normalized LIKE v_q || '%'
      AND NOT EXISTS (
        SELECT 1
        FROM public.registrations r
        WHERE r.event_id = p_event_id
          AND r.player_id = p.id
          AND r.cancelled_at IS NULL
      )
    ORDER BY p.name_normalized ASC
    LIMIT 10;
END;
$function$;

REVOKE ALL ON FUNCTION public.internal_search_players(text, uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_search_players(text, uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_search_players(text, uuid, uuid) TO service_role;