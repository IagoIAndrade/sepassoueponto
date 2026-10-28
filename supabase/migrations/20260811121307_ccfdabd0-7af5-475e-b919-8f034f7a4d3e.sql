
-- 1. Garantir acesso à tabela de inscrições para o player autenticado
-- O RLS já cuida de 'only self', mas o GRANT é o primeiro portão.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO authenticated;
GRANT ALL ON public.registrations TO service_role;

-- 2. Garantir acesso à tabela de incidentes para registro de saídas tardias
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_incidents TO authenticated;
GRANT ALL ON public.player_incidents TO service_role;

-- 3. Garantir acesso ao log de ações administrativas
GRANT SELECT, INSERT, UPDATE ON public.admin_actions_log TO authenticated;
GRANT ALL ON public.admin_actions_log TO service_role;

-- 4. Grant de execução na RPC com as duas assinaturas possíveis (limpeza)
GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v2(uuid, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v2(uuid, uuid) TO authenticated;

-- 5. Garantir que o service_role tenha acesso total a tudo para triggers e SD functions
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
