-- 1. SANEAR GRANTS GLOBAIS (Revogar de PUBLIC onde possível)
-- Nota: A plataforma pode restringir REVOKE ALL em alguns esquemas, então focamos em funções sensíveis.

-- Revogar EXECUTE de funções administrativas (usando assinaturas exatas do psql)
REVOKE EXECUTE ON FUNCTION public.admin_create_next_event_v2(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_create_next_event_v2(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_auto_enroll_organizers(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_auto_enroll_organizers(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_save_reviewed_accesses_v2(uuid[],uuid[],text,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_save_reviewed_accesses_v2(uuid[],uuid[],text,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_save_teams(uuid,jsonb,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_save_teams(uuid,jsonb,uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_set_event_status(uuid,event_status,boolean,uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.admin_set_event_status(uuid,event_status,boolean,uuid) FROM authenticated;

-- 2. GARANTIR GRANTS PARA FUNÇÕES DE JOGADORES (PostgREST precisa disso)
GRANT EXECUTE ON FUNCTION public.internal_join_event(uuid,uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v2(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_player() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_registrations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_event_full(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_sync_event_status(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_check_avatar_access(uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(app_role) TO authenticated;

-- 3. REFORÇO DE VALIDAÇÃO DENTRO DAS RPCS ADMINISTRATIVAS (Via SECURITY DEFINER e search_path)
-- Isso funciona mesmo sem GRANT se a função já existir e formos autorizados a editá-la, 
-- mas como a auditoria pede prevenção, vamos focar no search_path das que pudermos.

ALTER FUNCTION public.internal_join_event(uuid,uuid,uuid,boolean) SET search_path = public, pg_temp;
ALTER FUNCTION public.internal_leave_registration_v2(uuid,uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.internal_check_avatar_access(uuid,uuid) SET search_path = public, pg_temp;

-- 4. LOG DE AUDITORIA DE SEGURANÇA
INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, details)
VALUES (auth.uid(), 'security_hardening', 'system', '{"message": "Audit and hardening applied", "date": "2026-08-11"}');
