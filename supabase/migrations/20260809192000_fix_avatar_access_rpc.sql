CREATE OR REPLACE FUNCTION public.internal_check_avatar_access(p_viewer_id uuid, p_target_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- 1. Se for o próprio jogador
  IF p_viewer_id = p_target_id THEN
    RETURN true;
  END IF;

  -- 2. Se o viewer for um administrador (auth.users id)
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = p_viewer_id AND role = 'admin'
  ) THEN
    RETURN true;
  END IF;

  -- 3. Se compartilharem pelo menos uma turma aprovada
  RETURN EXISTS (
    SELECT 1 FROM public.player_groups pg1
    JOIN public.player_groups pg2 ON pg1.group_id = pg2.group_id
    WHERE pg1.player_id = p_viewer_id
    AND pg1.status = 'approved'
    AND pg2.player_id = p_target_id
    AND pg2.status = 'approved'
  );
END;
$$;
