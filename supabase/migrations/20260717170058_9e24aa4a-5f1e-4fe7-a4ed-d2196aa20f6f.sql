CREATE OR REPLACE FUNCTION public.get_public_teams(p_event_id uuid)
RETURNS TABLE(team_number smallint, player_name text, position_number integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT t.team_number, p.name, r.position_number
  FROM public.teams t
  JOIN public.team_members tm ON tm.team_id = t.id
  JOIN public.registrations r ON r.id = tm.registration_id
  JOIN public.players p ON p.id = r.player_id
  WHERE t.event_id = p_event_id
    AND r.cancelled_at IS NULL
  ORDER BY t.team_number, r.position_number;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_teams(uuid) TO anon, authenticated, service_role;