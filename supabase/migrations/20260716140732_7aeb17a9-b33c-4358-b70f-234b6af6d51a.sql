
-- Revogar EXECUTE explicitamente para anon e authenticated
REVOKE EXECUTE ON FUNCTION public.hash_pin(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_pin(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hash_token(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.internal_create_session(uuid, inet, text, int) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.internal_validate_session(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.internal_revoke_session(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.internal_is_blocked(uuid, date) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.lock_event(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.internal_join_event(uuid, uuid, uuid, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.internal_leave_registration(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.internal_get_my_registrations(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.internal_search_players(text, uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_add_player(uuid, uuid, public.list_type, uuid, boolean) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_remove_registration(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_move(uuid, public.list_type, int, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_block_player(uuid, date, date, text, text, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_unblock_player(uuid, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_save_teams(uuid, jsonb, uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tick_events() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired() FROM anon, authenticated;

-- Revogar também o default privilege em novas funções para não recriar o problema
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC;

-- RPC administrativa para alternar manual_override (evita UPDATE direto)
CREATE OR REPLACE FUNCTION public.admin_set_event_status(
  p_event_id uuid, p_status public.event_status, p_manual_override boolean, p_admin_user_id uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.volleyball_events
     SET status = p_status, manual_override = p_manual_override
   WHERE id = p_event_id;
  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id, 'admin_set_event_status', 'event', p_event_id,
          jsonb_build_object('status', p_status, 'manual_override', p_manual_override));
END; $$;
REVOKE ALL ON FUNCTION public.admin_set_event_status(uuid, public.event_status, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_event_status(uuid, public.event_status, boolean, uuid) TO service_role;
