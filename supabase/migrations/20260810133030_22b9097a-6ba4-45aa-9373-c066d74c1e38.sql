GRANT EXECUTE ON FUNCTION public.internal_join_event(uuid, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_join_event(uuid, uuid, uuid, boolean) TO service_role;
GRANT SELECT ON public.registrations TO authenticated;
GRANT SELECT ON public.registrations TO service_role;
GRANT INSERT ON public.registrations TO authenticated;
GRANT INSERT ON public.registrations TO service_role;
