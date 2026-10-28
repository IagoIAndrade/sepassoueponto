CREATE OR REPLACE FUNCTION public.internal_delete_player_self(p_player_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Removemos todas as sessões ativas do jogador
    DELETE FROM public.player_sessions WHERE player_id = p_player_id;
    
    -- Deletamos o registro do jogador. 
    -- Assumimos que as tabelas dependentes (registrations, player_groups, player_skills) 
    -- possuem ON DELETE CASCADE na chave estrangeira player_id.
    
    DELETE FROM public.players WHERE id = p_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.internal_delete_player_self(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_delete_player_self(UUID) TO service_role;
