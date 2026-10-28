-- GRANTs básicos
GRANT SELECT, INSERT, UPDATE ON public.player_groups TO authenticated;
GRANT ALL ON public.player_groups TO service_role;

-- RLS
ALTER TABLE public.player_groups ENABLE ROW LEVEL SECURITY;

-- Políticas
DROP POLICY IF EXISTS "player_groups_select_policy" ON public.player_groups;
CREATE POLICY "player_groups_select_policy" ON public.player_groups
FOR SELECT TO authenticated
USING (player_id = auth.uid() OR has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "player_groups_insert_policy" ON public.player_groups;
CREATE POLICY "player_groups_insert_policy" ON public.player_groups
FOR INSERT TO authenticated
WITH CHECK (player_id = auth.uid() OR has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "player_groups_update_policy" ON public.player_groups;
CREATE POLICY "player_groups_update_policy" ON public.player_groups
FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));
