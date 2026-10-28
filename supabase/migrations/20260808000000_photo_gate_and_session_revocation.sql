-- 1. Invalidação Global de Sessões
UPDATE public.player_sessions 
SET revoked_at = now() 
WHERE revoked_at IS NULL;

-- 2. Garantir que a coluna avatar_path existe e está correta (já existe, mas garantimos)
-- ALTER TABLE public.players ADD COLUMN IF NOT EXISTS avatar_path text;

-- 3. Criar uma função para verificar se o avatar é válido (evita caminhos fantasmas ou iniciais)
CREATE OR REPLACE FUNCTION public.internal_get_player_v2(p_player_id uuid)
RETURNS TABLE (
    id uuid,
    name text,
    phone_normalized text,
    avatar_path text,
    has_valid_photo boolean,
    role text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.phone_normalized,
        p.avatar_path,
        (p.avatar_path IS NOT NULL AND p.avatar_path <> '' AND p.avatar_path NOT LIKE 'initials://%') as has_valid_photo,
        'player' as role
    FROM public.players p
    WHERE p.id = p_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.internal_get_player_v2(uuid) TO service_role;
