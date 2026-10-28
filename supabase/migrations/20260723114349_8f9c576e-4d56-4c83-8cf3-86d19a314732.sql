ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_priority_minutes_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_priority_minutes_check CHECK (priority_minutes >= 0 AND priority_minutes <= 1440);

ALTER TABLE public.volleyball_events DROP CONSTRAINT IF EXISTS volleyball_events_priority_minutes_check;
ALTER TABLE public.volleyball_events ADD CONSTRAINT volleyball_events_priority_minutes_check CHECK (priority_minutes IS NULL OR (priority_minutes >= 0 AND priority_minutes <= 1440));