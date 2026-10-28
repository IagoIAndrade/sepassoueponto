-- Grant execute on admin_set_event_status to authenticated role
-- This is necessary because the server function calls it via context.supabase.rpc
GRANT EXECUTE ON FUNCTION public.admin_set_event_status(uuid, public.event_status, boolean, uuid) TO authenticated;

-- Ensure internal_default_group_id is accessible if used as default in some functions
GRANT EXECUTE ON FUNCTION public.internal_default_group_id() TO authenticated;
