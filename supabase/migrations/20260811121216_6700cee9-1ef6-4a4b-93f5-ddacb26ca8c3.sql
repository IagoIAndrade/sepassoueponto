
-- Grant de execução para as funções de saída para o papel authenticated
GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v2(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v2(uuid, uuid) TO authenticated;

-- Grant em tabelas que a função security definer acessa
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_incidents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_actions_log TO authenticated;

-- service_role grants
GRANT ALL ON public.registrations TO service_role;
GRANT ALL ON public.player_incidents TO service_role;
GRANT ALL ON public.admin_actions_log TO service_role;
GRANT ALL ON public.volleyball_events TO service_role;
GRANT ALL ON public.app_settings TO service_role;
GRANT ALL ON public.player_groups TO service_role;
