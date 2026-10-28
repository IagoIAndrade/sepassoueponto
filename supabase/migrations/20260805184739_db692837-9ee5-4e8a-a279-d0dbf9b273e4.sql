CREATE OR REPLACE FUNCTION public.admin_create_next_event_v2(p_group_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_admin uuid := auth.uid();
  v_gid uuid := COALESCE(p_group_id, public.internal_default_group_id());
  v_calc jsonb;
  v_settings jsonb;
  v_next_date date;
  v_opens_at timestamptz;
  v_start time; v_end time; v_loc text; v_limit int; v_tz text; v_new_id uuid;
  v_wd_weekday int; v_wd_time time; v_pen_late int; v_pen_noshow int;
  v_show_rules boolean; v_priority int;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin,'admin') THEN
    RETURN jsonb_build_object('status','unauthorized');
  END IF;

  v_calc := public.internal_compute_next_round(v_gid);

  IF COALESCE(v_calc->>'status','') <> 'ok' THEN
    RETURN v_calc;
  END IF;

  v_settings := v_calc->'settings';

  v_next_date := (v_calc->>'next_date')::date;
  v_opens_at  := (v_calc->>'opens_at')::timestamptz;

  IF v_next_date IS NULL OR v_opens_at IS NULL THEN
    RETURN jsonb_build_object('status','invalid_settings','message','Não foi possível calcular a data da próxima rodada.');
  END IF;

  v_start := (v_settings->>'start_time')::time;
  v_end   := (v_settings->>'end_time')::time;
  v_loc   := v_settings->>'location';
  v_limit := (v_settings->>'main_limit')::int;
  v_tz    := COALESCE(v_settings->>'timezone','America/Sao_Paulo');

  v_wd_weekday := (v_settings->>'withdrawal_deadline_weekday')::int;
  v_wd_time    := (v_settings->>'withdrawal_deadline_time')::time;
  v_pen_late   := (v_settings->>'penalty_late_leave')::int;
  v_pen_noshow := (v_settings->>'penalty_no_show')::int;
  v_show_rules := (v_settings->>'show_rules_to_players')::boolean;
  v_priority   := (v_settings->>'priority_minutes')::int;

  BEGIN
    INSERT INTO public.volleyball_events
      (group_id, event_date, opens_at, status, location, start_time, end_time, main_limit, timezone, manual_override,
       withdrawal_deadline_weekday, withdrawal_deadline_time, penalty_late_leave, penalty_no_show,
       show_rules_to_players, priority_minutes)
    VALUES
      (v_gid, v_next_date, v_opens_at, 'scheduled', v_loc, v_start, v_end, v_limit, v_tz, false,
       v_wd_weekday, v_wd_time, v_pen_late, v_pen_noshow, v_show_rules, v_priority)
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('status','already_exists','event_date', v_next_date);
  END;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_admin,'admin_create_next_event_v2','event', v_new_id,
          jsonb_build_object('event_date', v_next_date,'opens_at', v_opens_at,'group_id', v_gid));

  RETURN jsonb_build_object(
    'status','created',
    'group_id', v_gid,
    'event', jsonb_build_object(
      'id', v_new_id,
      'event_date', v_next_date,
      'opens_at', v_opens_at,
      'start_time', v_start,
      'end_time', v_end,
      'location', v_loc,
      'main_limit', v_limit,
      'priority_minutes', v_priority,
      'status','scheduled'
    )
  );
END;
$fn$;