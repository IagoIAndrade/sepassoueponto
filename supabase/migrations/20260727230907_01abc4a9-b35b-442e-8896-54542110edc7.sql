-- ============ helpers de turma ============
CREATE OR REPLACE FUNCTION public.internal_default_group_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT id FROM public.groups WHERE slug = 'quarta' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_public_groups()
RETURNS TABLE(id uuid, slug text, name text, sort_order int, event_id uuid, event_date date,
              status event_status, main_limit int, main_count int, wait_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT g.id, g.slug, g.name, g.sort_order,
         e.id, e.event_date, e.status, e.main_limit,
         COALESCE((SELECT count(*)::int FROM public.registrations r
                   WHERE r.event_id = e.id AND r.cancelled_at IS NULL AND r.list_type='main'),0),
         COALESCE((SELECT count(*)::int FROM public.registrations r
                   WHERE r.event_id = e.id AND r.cancelled_at IS NULL AND r.list_type='wait'),0)
  FROM public.groups g
  LEFT JOIN LATERAL (
    SELECT e.* FROM public.volleyball_events e
    WHERE e.group_id = g.id
      AND e.status IN ('scheduled','open','closed')
      AND e.event_date >= (now() AT TIME ZONE COALESCE(e.timezone,'America/Sao_Paulo'))::date
    ORDER BY e.event_date ASC LIMIT 1
  ) e ON true
  WHERE g.active = true
  ORDER BY g.sort_order;
$$;

-- ============ settings / evento por turma ============
DROP FUNCTION IF EXISTS public.get_public_settings();
CREATE FUNCTION public.get_public_settings(p_group_id uuid DEFAULT NULL)
RETURNS TABLE(event_name text, location text, start_time time, end_time time, main_limit integer,
              timezone text, priority_minutes integer, group_id uuid, group_slug text, group_name text,
              event_weekday int, show_rules_to_players boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT s.event_name, s.location, s.start_time, s.end_time, s.main_limit, s.timezone,
         s.priority_minutes, g.id, g.slug, g.name, s.event_weekday, s.show_rules_to_players
  FROM public.app_settings s
  JOIN public.groups g ON g.id = s.group_id
  WHERE s.group_id = COALESCE(p_group_id, public.internal_default_group_id())
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.get_public_current_event();
CREATE FUNCTION public.get_public_current_event(p_group_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, event_date date, opens_at timestamptz, closes_at timestamptz, status event_status,
              location text, start_time time, end_time time, main_limit integer, priority_minutes integer,
              group_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT e.id, e.event_date, e.opens_at, e.closes_at, e.status,
         e.location, e.start_time, e.end_time, e.main_limit,
         COALESCE(e.priority_minutes, s.priority_minutes), e.group_id
  FROM public.volleyball_events e
  LEFT JOIN public.app_settings s ON s.group_id = e.group_id
  WHERE e.group_id = COALESCE(p_group_id, public.internal_default_group_id())
    AND e.status IN ('scheduled','open','closed')
    AND e.event_date >= (now() AT TIME ZONE COALESCE(e.timezone,'America/Sao_Paulo'))::date
  ORDER BY e.event_date ASC
  LIMIT 1;
$$;

-- ============ bloqueios com abrangência ============
CREATE OR REPLACE FUNCTION public.internal_is_blocked(p_player_id uuid, p_event_date date, p_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.player_blocks b
    WHERE b.player_id = p_player_id AND b.active = true
      AND p_event_date BETWEEN b.starts_at AND b.ends_at
      AND (b.scope = 'global' OR b.group_id IS NULL OR b.group_id = p_group_id)
  );
$$;

-- ============ rateio aplicável por turma ============
CREATE OR REPLACE FUNCTION public.internal_fund_applies_to_group(p_fund_id uuid, p_group_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.equipment_funds f
    WHERE f.id = p_fund_id
      AND (f.scope = 'global'
           OR EXISTS (SELECT 1 FROM public.fund_groups fg
                      WHERE fg.fund_id = f.id AND fg.group_id = p_group_id))
  );
$$;

CREATE OR REPLACE FUNCTION public.internal_active_fund_for_group(p_group_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  SELECT f.id FROM public.equipment_funds f
  WHERE f.is_active = true
    AND public.internal_fund_applies_to_group(f.id, COALESCE(p_group_id, public.internal_default_group_id()))
  ORDER BY (f.scope = 'group') DESC, f.created_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.internal_player_is_paid_up_fund(p_player_id uuid, p_fund_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_part public.fund_participants;
  v_paid numeric(10,2) := 0;
BEGIN
  IF p_fund_id IS NULL THEN RETURN true; END IF;

  SELECT fp.* INTO v_part
  FROM public.fund_participant_players fpp
  JOIN public.fund_participants fp ON fp.id = fpp.participant_id
  WHERE fpp.fund_id = p_fund_id AND fpp.player_id = p_player_id
  LIMIT 1;

  IF v_part.id IS NULL THEN RETURN false; END IF;
  IF NOT v_part.participates OR v_part.exempt THEN RETURN false; END IF;
  IF COALESCE(v_part.payment_reported, false) THEN RETURN true; END IF;

  SELECT COALESCE(SUM(amount),0)::numeric(10,2) INTO v_paid
  FROM public.fund_payments WHERE fund_id = p_fund_id AND participant_id = v_part.id;

  IF v_part.agreed_amount IS NULL THEN RETURN v_paid > 0; END IF;
  RETURN v_paid >= v_part.agreed_amount;
END;
$$;

CREATE OR REPLACE FUNCTION public.internal_player_is_paid_up(p_player_id uuid, p_group_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_fund uuid;
  v_ok boolean := true;
BEGIN
  FOR v_fund IN
    SELECT f.id FROM public.equipment_funds f
    WHERE f.is_active = true
      AND public.internal_fund_applies_to_group(f.id, COALESCE(p_group_id, public.internal_default_group_id()))
  LOOP
    IF NOT public.internal_player_is_paid_up_fund(p_player_id, v_fund) THEN
      v_ok := false;
    END IF;
  END LOOP;
  RETURN v_ok;
END;
$$;

-- ============ rateio público por turma ============
DROP FUNCTION IF EXISTS public.get_public_fund_summary();
CREATE FUNCTION public.get_public_fund_summary(p_group_id uuid DEFAULT NULL)
RETURNS TABLE(fund_id uuid, title text, total_amount numeric, due_date date, total_collected numeric,
              remaining_balance numeric, surplus_amount numeric, percent_collected numeric,
              is_active boolean, scope text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  WITH f AS (
    SELECT * FROM public.equipment_funds
    WHERE id = public.internal_active_fund_for_group(p_group_id)
  ), agg AS (
    SELECT COALESCE(SUM(p.amount),0)::numeric(10,2) AS total_collected
    FROM public.fund_payments p JOIN f ON f.id = p.fund_id
  )
  SELECT f.id, f.title, f.total_amount, f.due_date, agg.total_collected,
         GREATEST(0, f.total_amount - agg.total_collected)::numeric(10,2),
         GREATEST(0, agg.total_collected - f.total_amount)::numeric(10,2),
         CASE WHEN f.total_amount > 0 THEN ROUND((agg.total_collected / f.total_amount) * 100, 2) ELSE 0 END,
         f.is_active, f.scope
  FROM f, agg;
$$;

DROP FUNCTION IF EXISTS public.get_public_fund_player_statuses();
CREATE FUNCTION public.get_public_fund_player_statuses(p_group_id uuid DEFAULT NULL)
RETURNS TABLE(player_id uuid, status text, has_paid boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
  WITH f AS (SELECT public.internal_active_fund_for_group(p_group_id) AS id),
  agg AS (
    SELECT fp.id AS participant_id, fp.participates, fp.exempt, fp.agreed_amount,
           COALESCE(fp.payment_reported,false) AS payment_reported,
           COALESCE((SELECT SUM(pay.amount) FROM public.fund_payments pay
                     WHERE pay.fund_id = (SELECT id FROM f) AND pay.participant_id = fp.id),0)::numeric(10,2) AS paid
    FROM public.fund_participants fp
    WHERE fp.fund_id = (SELECT id FROM f)
  ),
  computed AS (
    SELECT participant_id,
      CASE
        WHEN NOT participates THEN 'not_participating'
        WHEN exempt THEN 'exempt'
        WHEN agreed_amount IS NULL AND payment_reported AND paid = 0 THEN 'payment_reported'
        WHEN agreed_amount IS NULL THEN 'to_define'
        WHEN paid >= agreed_amount AND paid = agreed_amount THEN 'in_full'
        WHEN paid >= agreed_amount THEN 'overpaid'
        WHEN payment_reported THEN 'payment_reported'
        WHEN paid = 0 THEN 'pending'
        ELSE 'partial'
      END AS status,
      (paid > 0 OR payment_reported) AS has_paid
    FROM agg
  )
  SELECT fpp.player_id, c.status, c.has_paid
  FROM public.fund_participant_players fpp
  JOIN computed c ON c.participant_id = fpp.participant_id
  WHERE fpp.fund_id = (SELECT id FROM f);
$$;

DROP FUNCTION IF EXISTS public.get_my_fund_status(text);
CREATE FUNCTION public.get_my_fund_status(p_token text, p_group_id uuid DEFAULT NULL)
RETURNS TABLE(fund_id uuid, participant_id uuid, linked boolean, participates boolean, exempt boolean,
              agreed_amount numeric, total_paid numeric, outstanding numeric, surplus numeric, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_pid uuid;
  v_fund_id uuid;
  v_part public.fund_participants;
  v_paid numeric(10,2) := 0;
BEGIN
  v_pid := public.internal_validate_session(p_token);
  IF v_pid IS NULL THEN RETURN; END IF;

  v_fund_id := public.internal_active_fund_for_group(p_group_id);
  IF v_fund_id IS NULL THEN RETURN; END IF;

  SELECT fp.* INTO v_part
  FROM public.fund_participant_players fpp
  JOIN public.fund_participants fp ON fp.id = fpp.participant_id
  WHERE fpp.fund_id = v_fund_id AND fpp.player_id = v_pid
  LIMIT 1;

  IF v_part.id IS NULL THEN
    fund_id := v_fund_id; participant_id := NULL; linked := false; participates := false;
    exempt := false; agreed_amount := NULL; total_paid := 0; outstanding := 0; surplus := 0;
    status := 'to_define';
    RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE(SUM(pay.amount),0)::numeric(10,2) INTO v_paid
  FROM public.fund_payments pay WHERE pay.fund_id = v_fund_id AND pay.participant_id = v_part.id;

  fund_id := v_fund_id; participant_id := v_part.id; linked := true;
  participates := v_part.participates; exempt := v_part.exempt; agreed_amount := v_part.agreed_amount;
  total_paid := v_paid;
  outstanding := GREATEST(0, COALESCE(v_part.agreed_amount,0) - v_paid);
  surplus := GREATEST(0, v_paid - COALESCE(v_part.agreed_amount,0));

  IF NOT v_part.participates THEN status := 'not_participating';
  ELSIF v_part.exempt THEN status := 'exempt';
  ELSIF v_part.agreed_amount IS NULL THEN
    IF COALESCE(v_part.payment_reported,false) AND v_paid = 0 THEN status := 'payment_reported';
    ELSE status := 'to_define'; END IF;
  ELSIF v_paid >= v_part.agreed_amount THEN
    IF v_paid = v_part.agreed_amount THEN status := 'in_full'; ELSE status := 'overpaid'; END IF;
  ELSIF COALESCE(v_part.payment_reported,false) THEN status := 'payment_reported';
  ELSIF v_paid = 0 THEN status := 'pending';
  ELSE status := 'partial'; END IF;

  RETURN NEXT;
END;
$$;

-- ============ inscrição por turma ============
CREATE OR REPLACE FUNCTION public.internal_join_event(p_event_id uuid, p_target_player_id uuid, p_responsible_player_id uuid, p_force_override boolean DEFAULT false)
RETURNS TABLE(out_registration_id uuid, out_list_type list_type, out_position_number integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_event public.volleyball_events;
  v_target public.players;
  v_resp_cnt int; v_main_cnt int; v_pos int;
  v_list public.list_type; v_reg_id uuid;
  v_blocked boolean; v_priority_end timestamptz; v_remaining int;
  v_paid_up boolean; v_priority_minutes int;
BEGIN
  PERFORM public.lock_event(p_event_id);
  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF v_event.status <> 'open' THEN RAISE EXCEPTION 'event_not_open'; END IF;

  IF v_event.opens_at IS NULL OR v_event.opens_at > now() THEN
    UPDATE public.volleyball_events SET opens_at = now() WHERE id = p_event_id;
    SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
  END IF;

  SELECT * INTO v_target FROM public.players WHERE id = p_target_player_id;
  IF v_target.id IS NULL OR NOT v_target.active THEN RAISE EXCEPTION 'player_not_available'; END IF;

  v_blocked := public.internal_is_blocked(p_target_player_id, v_event.event_date, v_event.group_id);
  IF v_blocked AND NOT p_force_override THEN RAISE EXCEPTION 'player_blocked'; END IF;

  IF EXISTS (SELECT 1 FROM public.registrations r
             WHERE r.event_id = p_event_id AND r.player_id = p_target_player_id AND r.cancelled_at IS NULL) THEN
    RAISE EXCEPTION 'already_registered';
  END IF;

  v_priority_minutes := v_event.priority_minutes;
  IF v_priority_minutes IS NULL THEN
    SELECT priority_minutes INTO v_priority_minutes FROM public.app_settings WHERE group_id = v_event.group_id;
  END IF;

  IF v_event.opens_at IS NOT NULL AND COALESCE(v_priority_minutes,0) > 0 AND NOT p_force_override THEN
    v_priority_end := v_event.opens_at + make_interval(mins => v_priority_minutes);
    IF now() < v_priority_end THEN
      v_paid_up := public.internal_player_is_paid_up(p_target_player_id, v_event.group_id);
      IF NOT v_paid_up THEN
        v_remaining := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (v_priority_end - now()))))::int;
        RAISE EXCEPTION 'priority_window_active:%', v_remaining;
      END IF;
    END IF;
  END IF;

  SELECT count(*) INTO v_resp_cnt FROM public.registrations r
  WHERE r.event_id = p_event_id AND r.registered_by_player_id = p_responsible_player_id AND r.cancelled_at IS NULL;
  IF v_resp_cnt >= 2 THEN RAISE EXCEPTION 'responsible_limit_reached'; END IF;

  SELECT count(*) INTO v_main_cnt FROM public.registrations r
  WHERE r.event_id = p_event_id AND r.list_type = 'main' AND r.cancelled_at IS NULL;

  IF v_main_cnt < v_event.main_limit THEN
    v_list := 'main'; v_pos := v_main_cnt + 1;
  ELSE
    v_list := 'wait';
    SELECT coalesce(max(r.position_number),0)+1 INTO v_pos FROM public.registrations r
    WHERE r.event_id = p_event_id AND r.list_type = 'wait' AND r.cancelled_at IS NULL;
  END IF;

  INSERT INTO public.registrations (event_id, player_id, registered_by_player_id, list_type, position_number)
  VALUES (p_event_id, p_target_player_id, p_responsible_player_id, v_list, v_pos)
  RETURNING id INTO v_reg_id;

  -- vincula automaticamente o jogador à turma da rodada
  INSERT INTO public.player_groups (player_id, group_id)
  VALUES (p_target_player_id, v_event.group_id)
  ON CONFLICT DO NOTHING;

  IF p_force_override AND v_blocked THEN
    INSERT INTO public.admin_actions_log (action, target_type, target_id, details)
    VALUES ('force_add_blocked','registration', v_reg_id,
      jsonb_build_object('player_id', p_target_player_id, 'event_id', p_event_id));
  END IF;

  out_registration_id := v_reg_id; out_list_type := v_list; out_position_number := v_pos;
  RETURN NEXT;
END;
$$;

-- ============ saída da lista: bloqueio e ocorrência por turma ============
CREATE OR REPLACE FUNCTION public.internal_leave_registration_v2(p_registration_id uuid, p_requester_player_id uuid, p_confirm_late_leave boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_reg public.registrations;
  v_event public.volleyball_events;
  v_promoted uuid; v_wait_row public.registrations; v_next_pos int;
  v_now timestamptz := now(); v_days_before int; v_deadline_date date; v_deadline_at timestamptz;
  v_is_late boolean := false; v_penalty int; v_tz text;
  v_created_incident_id uuid; v_late_recorded boolean := false;
BEGIN
  SELECT event_id INTO v_reg.event_id FROM public.registrations WHERE id = p_registration_id;
  IF v_reg.event_id IS NULL THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  PERFORM public.lock_event(v_reg.event_id);

  SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id;
  IF v_reg.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'already_cancelled'; END IF;
  IF v_reg.registered_by_player_id <> p_requester_player_id AND v_reg.player_id <> p_requester_player_id THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_event FROM public.volleyball_events WHERE id = v_reg.event_id;
  v_tz := COALESCE(v_event.timezone,'America/Sao_Paulo');

  IF v_event.withdrawal_deadline_weekday IS NOT NULL AND v_event.withdrawal_deadline_time IS NOT NULL
     AND v_event.penalty_late_leave IS NOT NULL THEN
    v_days_before := ((EXTRACT(DOW FROM v_event.event_date)::int - v_event.withdrawal_deadline_weekday) + 7) % 7;
    v_deadline_date := v_event.event_date - v_days_before;
    v_deadline_at := ((v_deadline_date::timestamp + v_event.withdrawal_deadline_time) AT TIME ZONE v_tz);
    IF v_now >= v_deadline_at THEN v_is_late := true; v_penalty := v_event.penalty_late_leave; END IF;
  END IF;

  IF v_is_late AND NOT p_confirm_late_leave THEN
    RETURN jsonb_build_object('status','late_leave_confirmation_required','deadline_at', v_deadline_at,
                              'penalty_late_leave', v_penalty, 'timezone', v_tz);
  END IF;

  UPDATE public.registrations SET cancelled_at = v_now, cancelled_by_player_id = p_requester_player_id
   WHERE id = p_registration_id;

  IF v_reg.list_type = 'main' THEN
    UPDATE public.registrations SET position_number = position_number + 100000
     WHERE event_id = v_reg.event_id AND list_type='main' AND cancelled_at IS NULL AND position_number > v_reg.position_number;
    UPDATE public.registrations SET position_number = position_number - 100001
     WHERE event_id = v_reg.event_id AND list_type='main' AND cancelled_at IS NULL AND position_number > 100000;

    LOOP
      SELECT * INTO v_wait_row FROM public.registrations
       WHERE event_id = v_reg.event_id AND list_type='wait' AND cancelled_at IS NULL
       ORDER BY position_number ASC LIMIT 1;
      EXIT WHEN v_wait_row.id IS NULL;

      IF public.internal_is_blocked(v_wait_row.player_id, v_event.event_date, v_event.group_id) THEN
        UPDATE public.registrations SET cancelled_at = now(), cancelled_by_player_id = NULL WHERE id = v_wait_row.id;
        UPDATE public.registrations SET position_number = position_number + 100000
         WHERE event_id = v_reg.event_id AND list_type='wait' AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
        UPDATE public.registrations SET position_number = position_number - 100001
         WHERE event_id = v_reg.event_id AND list_type='wait' AND cancelled_at IS NULL AND position_number > 100000;
        INSERT INTO public.admin_actions_log (action, target_type, target_id, details)
        VALUES ('skip_blocked_on_promote','registration', v_wait_row.id,
                jsonb_build_object('event_id', v_reg.event_id, 'player_id', v_wait_row.player_id));
        CONTINUE;
      END IF;

      SELECT coalesce(max(position_number),0)+1 INTO v_next_pos FROM public.registrations
       WHERE event_id = v_reg.event_id AND list_type='main' AND cancelled_at IS NULL;
      UPDATE public.registrations SET list_type='main', position_number = v_next_pos WHERE id = v_wait_row.id;
      UPDATE public.registrations SET position_number = position_number + 100000
       WHERE event_id = v_reg.event_id AND list_type='wait' AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
      UPDATE public.registrations SET position_number = position_number - 100001
       WHERE event_id = v_reg.event_id AND list_type='wait' AND cancelled_at IS NULL AND position_number > 100000;
      v_promoted := v_wait_row.id;
      EXIT;
    END LOOP;
  ELSE
    UPDATE public.registrations SET position_number = position_number + 100000
     WHERE event_id = v_reg.event_id AND list_type='wait' AND cancelled_at IS NULL AND position_number > v_reg.position_number;
    UPDATE public.registrations SET position_number = position_number - 100001
     WHERE event_id = v_reg.event_id AND list_type='wait' AND cancelled_at IS NULL AND position_number > 100000;
  END IF;

  IF v_is_late THEN
    INSERT INTO public.player_incidents
      (event_id, player_id, incident_type, occurred_at, suggested_rounds, status, group_id, scope)
    VALUES
      (v_reg.event_id, v_reg.player_id, 'late_leave', v_now, v_penalty, 'pending', v_event.group_id, 'group')
    ON CONFLICT (event_id, player_id, incident_type) DO NOTHING
    RETURNING id INTO v_created_incident_id;
    v_late_recorded := (v_created_incident_id IS NOT NULL);
  END IF;

  RETURN jsonb_build_object('status','ok','cancelled_id', p_registration_id,'promoted_id', v_promoted,
                            'late_leave_detected', v_is_late,'late_leave_recorded', v_late_recorded);
END;
$$;

-- ============ próxima rodada por turma ============
DROP FUNCTION IF EXISTS public.internal_compute_next_round();
CREATE FUNCTION public.internal_compute_next_round(p_group_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  s public.app_settings;
  v_gid uuid := COALESCE(p_group_id, public.internal_default_group_id());
  v_today date; v_current_id uuid; v_current_date date;
  v_next_existing_id uuid; v_next_existing_date date;
  v_base date; v_delta int; v_next_date date; v_delta_back int; v_open_date date; v_opens_at timestamptz;
BEGIN
  SELECT * INTO s FROM public.app_settings WHERE group_id = v_gid LIMIT 1;
  IF s.id IS NULL THEN RETURN jsonb_build_object('status','invalid_settings'); END IF;

  v_today := (now() AT TIME ZONE s.timezone)::date;

  SELECT e.id, e.event_date INTO v_current_id, v_current_date
  FROM public.volleyball_events e
  WHERE e.group_id = v_gid AND e.status IN ('scheduled','open','closed') AND e.event_date >= v_today
  ORDER BY e.event_date ASC LIMIT 1;

  IF v_current_id IS NOT NULL THEN
    SELECT e.id, e.event_date INTO v_next_existing_id, v_next_existing_date
    FROM public.volleyball_events e
    WHERE e.group_id = v_gid AND e.status IN ('scheduled','open','closed') AND e.event_date > v_current_date
    ORDER BY e.event_date ASC LIMIT 1;
    v_base := v_current_date;
  ELSE
    v_base := v_today - 1;
  END IF;

  v_delta := ((s.event_weekday - EXTRACT(DOW FROM v_base)::int + 6) % 7) + 1;
  v_next_date := v_base + v_delta;

  v_delta_back := ((EXTRACT(DOW FROM v_next_date)::int - s.open_weekday) + 7) % 7;
  IF v_delta_back = 0 THEN v_delta_back := 7; END IF;
  v_open_date := v_next_date - v_delta_back;
  v_opens_at := ((v_open_date::timestamp + s.open_time) AT TIME ZONE s.timezone);

  RETURN jsonb_build_object(
    'status', CASE WHEN v_next_existing_id IS NOT NULL THEN 'blocked_by_existing_next_event' ELSE 'ready' END,
    'group_id', v_gid,
    'current', CASE WHEN v_current_id IS NOT NULL THEN jsonb_build_object('id', v_current_id,'event_date', v_current_date) ELSE NULL END,
    'next_existing', CASE WHEN v_next_existing_id IS NOT NULL THEN jsonb_build_object('id', v_next_existing_id,'event_date', v_next_existing_date) ELSE NULL END,
    'computed', jsonb_build_object(
      'event_date', v_next_date, 'opens_at', v_opens_at, 'start_time', s.start_time, 'end_time', s.end_time,
      'location', s.location, 'main_limit', s.main_limit, 'timezone', s.timezone,
      'event_weekday', s.event_weekday, 'open_weekday', s.open_weekday, 'open_time', s.open_time)
  );
END;
$$;

DROP FUNCTION IF EXISTS public.admin_preview_next_event();
CREATE FUNCTION public.admin_preview_next_event(p_group_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RETURN jsonb_build_object('status','unauthorized');
  END IF;
  RETURN public.internal_compute_next_round(p_group_id);
END;
$$;

DROP FUNCTION IF EXISTS public.admin_create_next_event_v2();
CREATE FUNCTION public.admin_create_next_event_v2(p_group_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_gid uuid := COALESCE(p_group_id, public.internal_default_group_id());
  v_calc jsonb; v_next_date date; v_opens_at timestamptz;
  v_start time; v_end time; v_loc text; v_limit int; v_tz text; v_new_id uuid;
  v_wd_weekday int; v_wd_time time; v_pen_late int; v_pen_noshow int;
  v_show_rules boolean; v_priority int;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin,'admin') THEN
    RETURN jsonb_build_object('status','unauthorized');
  END IF;

  v_calc := public.internal_compute_next_round(v_gid);
  IF v_calc->>'status' IN ('invalid_settings','blocked_by_existing_next_event') THEN RETURN v_calc; END IF;

  v_next_date := (v_calc->'computed'->>'event_date')::date;
  v_opens_at  := (v_calc->'computed'->>'opens_at')::timestamptz;
  v_start := (v_calc->'computed'->>'start_time')::time;
  v_end   := (v_calc->'computed'->>'end_time')::time;
  v_loc   := v_calc->'computed'->>'location';
  v_limit := (v_calc->'computed'->>'main_limit')::int;
  v_tz    := v_calc->'computed'->>'timezone';

  SELECT withdrawal_deadline_weekday, withdrawal_deadline_time, penalty_late_leave, penalty_no_show,
         show_rules_to_players, priority_minutes
    INTO v_wd_weekday, v_wd_time, v_pen_late, v_pen_noshow, v_show_rules, v_priority
  FROM public.app_settings WHERE group_id = v_gid;

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

  RETURN jsonb_build_object('status','created','group_id', v_gid,
    'event', jsonb_build_object('id', v_new_id,'event_date', v_next_date,'opens_at', v_opens_at,
      'start_time', v_start,'end_time', v_end,'location', v_loc,'main_limit', v_limit,
      'priority_minutes', v_priority,'status','scheduled'));
END;
$$;