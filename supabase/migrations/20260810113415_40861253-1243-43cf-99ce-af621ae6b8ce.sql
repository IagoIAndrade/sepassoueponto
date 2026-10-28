-- Garantir que RLS está ativado
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Política para leitura: todos autenticados e anon podem ver a lista
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'registrations_select_policy') THEN
        CREATE POLICY "registrations_select_policy" ON public.registrations FOR SELECT USING (true);
    END IF;
END $$;

-- Política para inserção: o próprio usuário pode se inscrever
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'registrations_insert_policy') THEN
        CREATE POLICY "registrations_insert_policy" ON public.registrations FOR INSERT TO authenticated WITH CHECK (auth.uid() = player_id);
    END IF;
END $$;

-- Política para atualização (cancelamento pelo usuário)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'registrations_update_policy') THEN
        CREATE POLICY "registrations_update_policy" ON public.registrations FOR UPDATE TO authenticated USING (auth.uid() = player_id) WITH CHECK (auth.uid() = player_id);
    END IF;
END $$;

-- Política de administrador (total acesso)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'registrations_admin_policy') THEN
        CREATE POLICY "registrations_admin_policy" ON public.registrations FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
    END IF;
END $$;

-- Garantir GRANTS para Data API
GRANT SELECT, INSERT, UPDATE, DELETE ON public.registrations TO authenticated;
GRANT ALL ON public.registrations TO service_role;
GRANT SELECT ON public.registrations TO anon;
