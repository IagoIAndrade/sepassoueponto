
-- Remover overload ambíguo e garantir que apenas a versão V3 (com promoção) exista e tenha as permissões corretas.
DROP FUNCTION IF EXISTS public.internal_leave_registration_v2(uuid, uuid);

-- Garantir que a versão correta tenha permissão para usuários autenticados
GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v2(uuid, uuid, boolean) TO authenticated;
