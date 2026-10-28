CREATE OR REPLACE FUNCTION public.debug_get_any_registration()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT id FROM public.registrations WHERE cancelled_at IS NULL LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.debug_get_any_registration() TO anon;
