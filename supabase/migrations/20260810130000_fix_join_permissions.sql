-- Garantir que a RPC pode ser executada por usuários autenticados (a lógica interna decide se pode ou não)
GRANT EXECUTE ON FUNCTION public.internal_join_event(uuid, uuid, uuid, boolean) TO authenticated;

-- Garantir acesso às tabelas necessárias para a service_role (usada nas RPCs Security Definer)
GRANT SELECT, INSERT, UPDATE ON public.registrations TO service_role;
GRANT SELECT, UPDATE ON public.volleyball_events TO service_role;
GRANT SELECT ON public.players TO service_role;
GRANT SELECT ON public.app_settings TO service_role;
GRANT SELECT, INSERT ON public.player_groups TO service_role;
GRANT INSERT ON public.admin_actions_log TO service_role;
