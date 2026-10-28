
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS event_name text NOT NULL DEFAULT 'SE PASSOU, E PONTO';

UPDATE public.app_settings SET event_name = 'SE PASSOU, E PONTO';

DROP FUNCTION IF EXISTS public.get_public_settings();

CREATE OR REPLACE FUNCTION public.get_public_settings()
 RETURNS TABLE(event_name text, location text, start_time time without time zone, end_time time without time zone, main_limit integer, timezone text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT event_name, location, start_time, end_time, main_limit, timezone
  FROM public.app_settings ORDER BY created_at ASC LIMIT 1;
$function$;
