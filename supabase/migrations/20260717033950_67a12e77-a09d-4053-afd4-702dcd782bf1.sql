
GRANT EXECUTE ON FUNCTION public.internal_compute_next_round() TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.admin_preview_next_event() TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.admin_create_next_event_v2() TO supabase_read_only_user;
GRANT EXECUTE ON FUNCTION public.admin_list_events() TO supabase_read_only_user;

-- Test helper for race probe: mimics the exception handler, unique on event_date.
-- Uses a distinctive test date far in the future to avoid impacting real data.
CREATE OR REPLACE FUNCTION public._test_probe_insert_event(p_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_new_id uuid;
BEGIN
  BEGIN
    INSERT INTO public.volleyball_events
      (event_date, opens_at, status, location, start_time, end_time, main_limit, timezone, manual_override)
    VALUES (p_date, p_date::timestamp AT TIME ZONE 'America/Sao_Paulo', 'scheduled', '_probe_', '19:00', '21:20', 18, 'America/Sao_Paulo', false)
    RETURNING id INTO v_new_id;
    RETURN jsonb_build_object('status','created','id',v_new_id);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status','already_exists','event_date',p_date);
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public._test_probe_insert_event(date) TO supabase_read_only_user, authenticator;
