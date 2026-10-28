ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS registration_source text DEFAULT 'inscription';
GRANT ALL ON public.registrations TO authenticated;
GRANT ALL ON public.registrations TO service_role;
