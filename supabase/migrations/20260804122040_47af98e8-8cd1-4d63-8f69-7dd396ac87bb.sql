GRANT SELECT ON public.groups TO authenticated, anon;
GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read groups" ON public.groups FOR SELECT TO authenticated, anon USING (true);
