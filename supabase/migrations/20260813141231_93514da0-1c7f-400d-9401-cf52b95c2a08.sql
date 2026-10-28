-- 1. Garantir que as funções administrativas tenham permissões explícitas para authenticated
-- O erro no ambiente publicado muitas vezes acontece por falta de GRANT mesmo que a função exista.

GRANT EXECUTE ON FUNCTION public.admin_add_player(uuid, uuid, list_type, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_player(uuid, uuid, list_type, uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_remove_registration_v3(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_validate_session(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(app_role) TO authenticated;

-- 2. Reforçar a idempotência dos overloads de internal_is_blocked
-- Garantimos que ambas as assinaturas apontem para a lógica correta.

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

GRANT EXECUTE ON FUNCTION public.internal_is_blocked(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.internal_is_blocked(uuid, date, uuid) TO authenticated, service_role;
