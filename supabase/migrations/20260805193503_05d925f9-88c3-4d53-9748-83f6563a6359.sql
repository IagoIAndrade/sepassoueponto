-- Função interna para verificar se um jogador pode ver o avatar de outro
CREATE OR REPLACE FUNCTION public.internal_check_avatar_access(p_viewer_id uuid, p_target_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.player_groups pg1
    JOIN public.player_groups pg2 ON pg1.group_id = pg2.group_id
    WHERE pg1.player_id = p_viewer_id 
    AND pg1.status = 'approved'
    AND pg2.player_id = p_target_id
    AND pg2.status = 'approved'
  );
$$;
