-- Adicionar permissões temporárias para auditoria via REST (só para este diagnóstico)
GRANT SELECT ON public.audit_results TO anon;
GRANT SELECT ON public.registrations TO anon;
