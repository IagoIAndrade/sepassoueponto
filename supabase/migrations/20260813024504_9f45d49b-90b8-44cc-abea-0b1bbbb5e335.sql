-- Remover política antiga se existir (para garantir idempotência)
DROP POLICY IF EXISTS "Users can manage their own subscriptions" ON public.push_subscriptions;

-- Criar política de SELECT
CREATE POLICY "Users can view their own push subscriptions" 
ON public.push_subscriptions FOR SELECT 
TO authenticated 
USING (player_id = auth.uid());

-- Criar política de INSERT
CREATE POLICY "Users can insert their own push subscriptions" 
ON public.push_subscriptions FOR INSERT 
TO authenticated 
WITH CHECK (player_id = auth.uid());

-- Criar política de UPDATE
CREATE POLICY "Users can update their own push subscriptions" 
ON public.push_subscriptions FOR UPDATE 
TO authenticated 
USING (player_id = auth.uid())
WITH CHECK (player_id = auth.uid());

-- Criar política de DELETE
CREATE POLICY "Users can delete their own push subscriptions" 
ON public.push_subscriptions FOR DELETE 
TO authenticated 
USING (player_id = auth.uid());
