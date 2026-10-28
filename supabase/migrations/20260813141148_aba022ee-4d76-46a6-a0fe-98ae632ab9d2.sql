-- 1. Limpar versões problemáticas para garantir assinaturas limpas
DROP FUNCTION IF EXISTS public.internal_is_blocked(uuid, date, uuid);
DROP FUNCTION IF EXISTS public.internal_is_blocked(uuid, date);

-- 2. Criar a versão base (3 parâmetros)
CREATE OR REPLACE FUNCTION public.internal_is_blocked(
    p_player_id uuid, 
    p_event_date date,
    p_group_id uuid
)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.player_blocks b
    WHERE b.player_id = p_player_id
      AND b.active = true
      AND p_event_date BETWEEN b.starts_at AND b.ends_at
  )
$function$;

-- 3. Criar a versão de compatibilidade (2 parâmetros)
CREATE OR REPLACE FUNCTION public.internal_is_blocked(
    p_player_id uuid, 
    p_event_date date
)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT public.internal_is_blocked(p_player_id, p_event_date, NULL::uuid);
$function$;

-- 4. Conceder permissões explícitas
GRANT EXECUTE ON FUNCTION public.internal_is_blocked(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.internal_is_blocked(uuid, date, uuid) TO authenticated, service_role;

-- 5. Garantir permissões para as funções de administração
GRANT EXECUTE ON FUNCTION public.admin_add_player(uuid, uuid, list_type, uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_add_player(uuid, uuid, list_type, uuid, boolean, text) TO authenticated, service_role;
