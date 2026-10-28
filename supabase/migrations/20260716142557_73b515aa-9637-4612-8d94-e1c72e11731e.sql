-- has_role: só usuários autenticados precisam (RLS de admin). anon não precisa.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;

-- utilitárias não-SECURITY-DEFINER: hygiene, remover EXECUTE de PUBLIC
REVOKE EXECUTE ON FUNCTION public.normalize_phone(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;