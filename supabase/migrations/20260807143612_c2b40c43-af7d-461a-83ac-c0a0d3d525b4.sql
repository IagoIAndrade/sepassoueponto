-- Garantindo que RLS está habilitado
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Removendo políticas antigas se existirem (para evitar erro de duplicidade)
DROP POLICY IF EXISTS "Admins can do everything on app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Anyone can read app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "Players can read app_settings" ON public.app_settings;

-- Criando políticas
CREATE POLICY "Admins can do everything on app_settings" 
ON public.app_settings 
FOR ALL 
TO authenticated 
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read app_settings" 
ON public.app_settings 
FOR SELECT 
TO anon, authenticated 
USING (true);

-- Concedendo permissões
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
GRANT SELECT ON public.app_settings TO anon;
