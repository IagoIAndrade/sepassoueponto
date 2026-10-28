
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS access_restriction_active BOOLEAN DEFAULT FALSE;
UPDATE public.app_settings SET access_restriction_active = TRUE;

GRANT SELECT ON public.app_settings TO authenticated;
GRANT SELECT ON public.app_settings TO anon;
GRANT ALL ON public.app_settings TO service_role;
