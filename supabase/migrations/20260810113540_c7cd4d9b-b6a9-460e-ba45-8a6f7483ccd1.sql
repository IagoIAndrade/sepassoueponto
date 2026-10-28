GRANT EXECUTE ON FUNCTION public.admin_remove_registration_v2(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_registration_v2(uuid, uuid) TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.volleyball_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_actions_log TO authenticated;
GRANT ALL ON public.registrations TO service_role;
GRANT ALL ON public.volleyball_events TO service_role;
GRANT ALL ON public.admin_actions_log TO service_role;