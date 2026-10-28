CREATE OR REPLACE FUNCTION public.debug_get_object_source(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_def text;
BEGIN
    SELECT pg_get_functiondef(oid) INTO v_def FROM pg_proc WHERE proname = p_name LIMIT 1;
    RETURN v_def;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_get_object_source(text) TO anon;
