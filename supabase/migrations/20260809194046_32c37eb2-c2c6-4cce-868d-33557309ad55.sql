-- Reforço de Segurança: Melhorar search_path e qualificação de objetos
-- Alterar para SET search_path = '' e usar nomes qualificados para máxima segurança contra ataques de shadowing
CREATE OR REPLACE FUNCTION public.internal_get_my_full_history(p_player_id uuid, p_limit integer DEFAULT 10)
 RETURNS TABLE(id uuid, list_type public.list_type, position_number integer, created_at timestamp with time zone, cancelled_at timestamp with time zone, event_id uuid, event_date date, event_status public.event_status, start_time text, group_name text, main_limit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_auth_id uuid;
BEGIN
    -- Obter o ID do usuário autenticado de forma segura
    v_auth_id := auth.uid();

    -- Validação de segurança rigorosa: 
    -- 1. Deve estar autenticado
    -- 2. O p_player_id fornecido DEVE ser igual ao auth.uid() do usuário logado
    -- Premissa auditada: players.id = auth.users.id
    IF v_auth_id IS NULL OR p_player_id IS NULL OR p_player_id <> v_auth_id THEN
        RAISE EXCEPTION 'Acesso negado: você só pode consultar seu próprio histórico.';
    END IF;

    RETURN QUERY
    SELECT 
        r.id,
        r.list_type,
        r.position_number,
        r.created_at,
        r.cancelled_at,
        e.id as event_id,
        e.event_date,
        e.status as event_status,
        e.start_time::text,
        g.name as group_name,
        e.main_limit
    FROM public.registrations r
    JOIN public.volleyball_events e ON e.id = r.event_id
    JOIN public.groups g ON g.id = e.group_id
    WHERE r.player_id = v_auth_id -- Usamos v_auth_id diretamente por segurança extra
    ORDER BY e.event_date DESC, r.created_at DESC
    LIMIT p_limit;
END;
$function$;

-- Revogar permissões existentes para garantir estado limpo
REVOKE ALL ON FUNCTION public.internal_get_my_full_history(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_get_my_full_history(uuid, integer) FROM anon;

-- Garantir acesso apenas para usuários autenticados e service_role
GRANT EXECUTE ON FUNCTION public.internal_get_my_full_history(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_get_my_full_history(uuid, integer) TO service_role;
