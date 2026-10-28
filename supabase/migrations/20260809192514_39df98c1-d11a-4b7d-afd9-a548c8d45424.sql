ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS announcement text;
COMMENT ON COLUMN public.app_settings.announcement IS 'Organizational announcement for the group players.';
