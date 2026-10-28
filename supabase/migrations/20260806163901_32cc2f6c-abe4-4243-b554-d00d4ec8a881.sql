CREATE OR REPLACE FUNCTION public.admin_delete_player(p_player_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- 1. Remover registros em times
    DELETE FROM public.team_members WHERE registration_id IN (
        SELECT id FROM public.registrations WHERE player_id = p_player_id
    );
    
    -- 2. Remover inscrições
    DELETE FROM public.registrations WHERE player_id = p_player_id;
    
    -- 3. Remover vínculos com turmas
    DELETE FROM public.player_groups WHERE player_id = p_player_id;
    
    -- 4. Remover habilidades
    DELETE FROM public.player_skills WHERE player_id = p_player_id;
    
    -- 5. Remover ocorrências
    DELETE FROM public.incidents WHERE player_id = p_player_id;
    
    -- 6. Remover registros de rateio
    DELETE FROM public.fund_participants WHERE player_id = p_player_id;

    -- 7. Por fim, remover o jogador
    DELETE FROM public.players WHERE id = p_player_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_player(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_player(UUID) TO service_role;
