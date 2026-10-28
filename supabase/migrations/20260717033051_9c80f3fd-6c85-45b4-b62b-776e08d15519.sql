
-- 1. Shared computation
CREATE OR REPLACE FUNCTION public.internal_compute_next_round()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s public.app_settings;
  v_today date;
  v_current_id uuid;
  v_current_date date;
  v_next_existing_id uuid;
  v_next_existing_date date;
  v_base date;
  v_delta int;
  v_next_date date;
  v_delta_back int;
  v_open_date date;
  v_opens_at timestamptz;
BEGIN
  SELECT * INTO s FROM public.app_settings ORDER BY created_at ASC LIMIT 1;
  IF s.id IS NULL THEN
    RETURN jsonb_build_object('status','invalid_settings');
  END IF;

  v_today := (now() AT TIME ZONE s.timezone)::date;

  SELECT e.id, e.event_date INTO v_current_id, v_current_date
  FROM public.volleyball_events e
  WHERE e.status IN ('scheduled','open','closed')
    AND e.event_date >= v_today
  ORDER BY e.event_date ASC LIMIT 1;

  IF v_current_id IS NOT NULL THEN
    SELECT e.id, e.event_date INTO v_next_existing_id, v_next_existing_date
    FROM public.volleyball_events e
    WHERE e.status IN ('scheduled','open','closed')
      AND e.event_date > v_current_date
    ORDER BY e.event_date ASC LIMIT 1;
  END IF;

  IF v_current_id IS NOT NULL THEN
    v_base := v_current_date;
  ELSE
    v_base := v_today;
  END IF;

  v_delta := ((s.event_weekday - EXTRACT(DOW FROM v_base)::int + 6) % 7) + 1;
  v_next_date := v_base + v_delta;

  v_delta_back := ((EXTRACT(DOW FROM v_next_date)::int - s.open_weekday) + 7) % 7;
  IF v_delta_back = 0 THEN v_delta_back := 7; END IF;
  v_open_date := v_next_date - v_delta_back;
  v_opens_at := ((v_open_date::timestamp + s.open_time) AT TIME ZONE s.timezone);

  RETURN jsonb_build_object(
    'status', CASE WHEN v_next_existing_id IS NOT NULL THEN 'blocked_by_existing_next_event' ELSE 'ready' END,
    'current', CASE WHEN v_current_id IS NOT NULL
                    THEN jsonb_build_object('id', v_current_id, 'event_date', v_current_date)
                    ELSE NULL END,
    'next_existing', CASE WHEN v_next_existing_id IS NOT NULL
                          THEN jsonb_build_object('id', v_next_existing_id, 'event_date', v_next_existing_date)
                          ELSE NULL END,
    'computed', jsonb_build_object(
      'event_date', v_next_date,
      'opens_at', v_opens_at,
      'start_time', s.start_time,
      'end_time', s.end_time,
      'location', s.location,
      'main_limit', s.main_limit,
      'timezone', s.timezone,
      'event_weekday', s.event_weekday,
      'open_weekday', s.open_weekday,
      'open_time', s.open_time
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.internal_compute_next_round() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_compute_next_round() FROM anon;
REVOKE ALL ON FUNCTION public.internal_compute_next_round() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_compute_next_round() TO service_role;

-- 2. Preview (admin only)
CREATE OR REPLACE FUNCTION public.admin_preview_next_event()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RETURN jsonb_build_object('status','unauthorized');
  END IF;
  RETURN public.internal_compute_next_round();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_preview_next_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_preview_next_event() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_preview_next_event() TO authenticated;

-- 3. Create v2 (admin only, atomic, structured return)
CREATE OR REPLACE FUNCTION public.admin_create_next_event_v2()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_calc jsonb;
  v_next_date date;
  v_opens_at timestamptz;
  v_start time; v_end time; v_loc text; v_limit int; v_tz text;
  v_new_id uuid;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RETURN jsonb_build_object('status','unauthorized');
  END IF;

  v_calc := public.internal_compute_next_round();
  IF v_calc->>'status' = 'invalid_settings' THEN
    RETURN v_calc;
  END IF;
  IF v_calc->>'status' = 'blocked_by_existing_next_event' THEN
    RETURN v_calc;
  END IF;

  v_next_date := (v_calc->'computed'->>'event_date')::date;
  v_opens_at  := (v_calc->'computed'->>'opens_at')::timestamptz;
  v_start := (v_calc->'computed'->>'start_time')::time;
  v_end   := (v_calc->'computed'->>'end_time')::time;
  v_loc   := v_calc->'computed'->>'location';
  v_limit := (v_calc->'computed'->>'main_limit')::int;
  v_tz    := v_calc->'computed'->>'timezone';

  BEGIN
    INSERT INTO public.volleyball_events
      (event_date, opens_at, status, location, start_time, end_time, main_limit, timezone, manual_override)
    VALUES (v_next_date, v_opens_at, 'scheduled', v_loc, v_start, v_end, v_limit, v_tz, false)
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status','already_exists','event_date', v_next_date);
  END;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_admin, 'admin_create_next_event_v2', 'event', v_new_id,
          jsonb_build_object('event_date', v_next_date, 'opens_at', v_opens_at));

  RETURN jsonb_build_object(
    'status','created',
    'event', jsonb_build_object(
      'id', v_new_id,
      'event_date', v_next_date,
      'opens_at', v_opens_at,
      'start_time', v_start,
      'end_time', v_end,
      'location', v_loc,
      'main_limit', v_limit,
      'status','scheduled'
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_next_event_v2() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_next_event_v2() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_create_next_event_v2() TO authenticated;

-- 4. List events (admin only) with is_current / is_next flags
CREATE OR REPLACE FUNCTION public.admin_list_events()
RETURNS TABLE(
  id uuid,
  event_date date,
  status event_status,
  opens_at timestamptz,
  start_time time,
  end_time time,
  location text,
  main_limit int,
  is_current boolean,
  is_next boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  s public.app_settings;
  v_today date;
  v_current uuid;
  v_current_date date;
  v_next uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO s FROM public.app_settings ORDER BY created_at ASC LIMIT 1;
  v_today := (now() AT TIME ZONE COALESCE(s.timezone,'America/Sao_Paulo'))::date;

  SELECT e.id, e.event_date INTO v_current, v_current_date
  FROM public.volleyball_events e
  WHERE e.status IN ('scheduled','open','closed')
    AND e.event_date >= v_today
  ORDER BY e.event_date ASC LIMIT 1;

  IF v_current IS NOT NULL THEN
    SELECT e.id INTO v_next
    FROM public.volleyball_events e
    WHERE e.status IN ('scheduled','open','closed')
      AND e.event_date > v_current_date
    ORDER BY e.event_date ASC LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT e.id, e.event_date, e.status, e.opens_at,
         e.start_time, e.end_time, e.location, e.main_limit,
         (e.id = v_current) AS is_current,
         (e.id = v_next)    AS is_next
  FROM public.volleyball_events e
  ORDER BY e.event_date DESC
  LIMIT 50;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_events() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_events() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_events() TO authenticated;
