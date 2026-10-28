CREATE OR REPLACE FUNCTION public.debug_execute_sql(p_sql text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_ret jsonb;
BEGIN
    EXECUTE 'SELECT jsonb_agg(t) FROM (' || p_sql || ') t' INTO v_ret;
    RETURN v_ret;
END;
$$;
GRANT EXECUTE ON FUNCTION public.debug_execute_sql(text) TO anon;
