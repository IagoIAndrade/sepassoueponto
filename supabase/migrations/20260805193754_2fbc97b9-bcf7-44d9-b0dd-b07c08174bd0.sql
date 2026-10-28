DROP FUNCTION IF EXISTS public.get_public_registrations(uuid);

CREATE FUNCTION public.get_public_registrations(p_event_id uuid)
RETURNS TABLE(
  player_id uuid,
  player_name text,
  player_avatar_path text,
  list_type list_type,
  position_number integer,
  created_at timestamp with time zone
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.id, p.name, p.avatar_path, r.list_type, r.position_number, r.created_at
  FROM public.registrations r
  JOIN public.players p ON p.id = r.player_id
  WHERE r.event_id = p_event_id AND r.cancelled_at IS NULL
  ORDER BY r.list_type, r.position_number;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_registrations(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_registrations(uuid) TO anon, authenticated;
