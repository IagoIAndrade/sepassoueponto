-- Grant essencial para o PostgREST funcionar com a role authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO authenticated;
GRANT SELECT ON public.volleyball_events TO authenticated;
GRANT SELECT ON public.players TO authenticated;
GRANT SELECT ON public.app_settings TO authenticated;
GRANT SELECT ON public.groups TO authenticated;

-- Grants para service_role (usada internamente por triggers e funções security definer)
GRANT ALL ON public.registrations TO service_role;
GRANT ALL ON public.volleyball_events TO service_role;
GRANT ALL ON public.players TO service_role;
GRANT ALL ON public.app_settings TO service_role;

-- Grant de execução da RPC
GRANT EXECUTE ON FUNCTION public.internal_join_event(uuid, uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_sync_event_status(uuid, uuid, text) TO authenticated;
