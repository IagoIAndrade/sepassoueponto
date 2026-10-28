CREATE OR REPLACE FUNCTION public.admin_delete_player(p_player_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.team_members tm
   USING public.registrations r
   WHERE tm.registration_id = r.id AND r.player_id = p_player_id;

  DELETE FROM public.registrations
   WHERE player_id = p_player_id
      OR registered_by_player_id = p_player_id
      OR cancelled_by_player_id = p_player_id;

  DELETE FROM public.event_attendance WHERE player_id = p_player_id;
  DELETE FROM public.player_incidents WHERE player_id = p_player_id;
  DELETE FROM public.player_blocks WHERE player_id = p_player_id;
  DELETE FROM public.player_skills WHERE player_id = p_player_id;
  DELETE FROM public.player_groups WHERE player_id = p_player_id;
  DELETE FROM public.fund_participant_players WHERE player_id = p_player_id;

  DELETE FROM public.player_search_hits sh
   USING public.player_sessions s
   WHERE sh.session_id = s.id AND s.player_id = p_player_id;
  DELETE FROM public.player_sessions WHERE player_id = p_player_id;

  DELETE FROM public.players WHERE id = p_player_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_player(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_player(uuid) TO service_role;