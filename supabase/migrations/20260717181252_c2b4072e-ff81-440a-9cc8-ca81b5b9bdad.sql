
-- =========================================================
-- AJUSTE C2: correção do retorno late_leave_recorded
-- =========================================================
CREATE OR REPLACE FUNCTION public.internal_leave_registration_v2(
  p_registration_id uuid,
  p_requester_player_id uuid,
  p_confirm_late_leave boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_reg       public.registrations;
  v_event     public.volleyball_events;
  v_promoted  uuid;
  v_wait_row  public.registrations;
  v_next_pos  int;
  v_now       timestamptz := now();
  v_days_before int;
  v_deadline_date date;
  v_deadline_at timestamptz;
  v_is_late boolean := false;
  v_penalty int;
  v_tz text;
  v_created_incident_id uuid;
  v_late_recorded boolean := false;
BEGIN
  SELECT event_id INTO v_reg.event_id FROM public.registrations WHERE id = p_registration_id;
  IF v_reg.event_id IS NULL THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  PERFORM public.lock_event(v_reg.event_id);

  SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id;
  IF v_reg.cancelled_at IS NOT NULL THEN RAISE EXCEPTION 'already_cancelled'; END IF;

  IF v_reg.registered_by_player_id <> p_requester_player_id
     AND v_reg.player_id <> p_requester_player_id THEN
     RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_event FROM public.volleyball_events WHERE id = v_reg.event_id;
  v_tz := COALESCE(v_event.timezone, 'America/Sao_Paulo');

  IF v_event.withdrawal_deadline_weekday IS NOT NULL
     AND v_event.withdrawal_deadline_time IS NOT NULL
     AND v_event.penalty_late_leave IS NOT NULL THEN
    v_days_before := ((EXTRACT(DOW FROM v_event.event_date)::int
                       - v_event.withdrawal_deadline_weekday) + 7) % 7;
    v_deadline_date := v_event.event_date - v_days_before;
    v_deadline_at := ((v_deadline_date::timestamp + v_event.withdrawal_deadline_time)
                       AT TIME ZONE v_tz);
    IF v_now >= v_deadline_at THEN
      v_is_late := true;
      v_penalty := v_event.penalty_late_leave;
    END IF;
  END IF;

  IF v_is_late AND NOT p_confirm_late_leave THEN
    RETURN jsonb_build_object(
      'status', 'late_leave_confirmation_required',
      'deadline_at', v_deadline_at,
      'penalty_late_leave', v_penalty,
      'timezone', v_tz
    );
  END IF;

  UPDATE public.registrations
     SET cancelled_at = v_now, cancelled_by_player_id = p_requester_player_id
   WHERE id = p_registration_id;

  IF v_reg.list_type = 'main' THEN
    UPDATE public.registrations SET position_number = position_number + 100000
     WHERE event_id = v_reg.event_id AND list_type = 'main'
       AND cancelled_at IS NULL AND position_number > v_reg.position_number;
    UPDATE public.registrations SET position_number = position_number - 100001
     WHERE event_id = v_reg.event_id AND list_type = 'main'
       AND cancelled_at IS NULL AND position_number > 100000;

    LOOP
      SELECT * INTO v_wait_row FROM public.registrations
       WHERE event_id = v_reg.event_id AND list_type = 'wait' AND cancelled_at IS NULL
       ORDER BY position_number ASC LIMIT 1;
      EXIT WHEN v_wait_row.id IS NULL;

      IF public.internal_is_blocked(v_wait_row.player_id, v_event.event_date) THEN
        UPDATE public.registrations SET cancelled_at = now(), cancelled_by_player_id = NULL
         WHERE id = v_wait_row.id;
        UPDATE public.registrations SET position_number = position_number + 100000
         WHERE event_id = v_reg.event_id AND list_type = 'wait'
           AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
        UPDATE public.registrations SET position_number = position_number - 100001
         WHERE event_id = v_reg.event_id AND list_type = 'wait'
           AND cancelled_at IS NULL AND position_number > 100000;
        INSERT INTO public.admin_actions_log (action, target_type, target_id, details)
        VALUES ('skip_blocked_on_promote','registration', v_wait_row.id,
                jsonb_build_object('event_id', v_reg.event_id, 'player_id', v_wait_row.player_id));
        CONTINUE;
      END IF;

      SELECT coalesce(max(position_number),0)+1 INTO v_next_pos FROM public.registrations
       WHERE event_id = v_reg.event_id AND list_type = 'main' AND cancelled_at IS NULL;
      UPDATE public.registrations
         SET list_type = 'main', position_number = v_next_pos
       WHERE id = v_wait_row.id;
      UPDATE public.registrations SET position_number = position_number + 100000
       WHERE event_id = v_reg.event_id AND list_type = 'wait'
         AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
      UPDATE public.registrations SET position_number = position_number - 100001
       WHERE event_id = v_reg.event_id AND list_type = 'wait'
         AND cancelled_at IS NULL AND position_number > 100000;
      v_promoted := v_wait_row.id;
      EXIT;
    END LOOP;
  ELSE
    UPDATE public.registrations SET position_number = position_number + 100000
     WHERE event_id = v_reg.event_id AND list_type = 'wait'
       AND cancelled_at IS NULL AND position_number > v_reg.position_number;
    UPDATE public.registrations SET position_number = position_number - 100001
     WHERE event_id = v_reg.event_id AND list_type = 'wait'
       AND cancelled_at IS NULL AND position_number > 100000;
  END IF;

  -- Ajuste C2: só considerar "recorded" quando uma nova linha é criada.
  IF v_is_late THEN
    INSERT INTO public.player_incidents
      (event_id, player_id, incident_type, occurred_at, suggested_rounds, status)
    VALUES
      (v_reg.event_id, v_reg.player_id, 'late_leave', v_now, v_penalty, 'pending')
    ON CONFLICT (event_id, player_id, incident_type) DO NOTHING
    RETURNING id INTO v_created_incident_id;

    v_late_recorded := (v_created_incident_id IS NOT NULL);
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'cancelled_id', p_registration_id,
    'promoted_id', v_promoted,
    'late_leave_detected', v_is_late,
    'late_leave_recorded', v_late_recorded
  );
END;
$function$;

-- =========================================================
-- RPC: aceitar justificativa
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_accept_incident_justification(
  p_incident_id uuid,
  p_admin_user_id uuid,
  p_justification text,
  p_admin_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inc public.player_incidents;
  v_just text;
  v_notes text;
BEGIN
  IF p_admin_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_admin_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_just := btrim(coalesce(p_justification, ''));
  IF length(v_just) < 3 OR length(v_just) > 2000 THEN
    RAISE EXCEPTION 'invalid_justification';
  END IF;
  v_notes := coalesce(p_admin_notes, '');
  IF length(v_notes) > 2000 THEN RAISE EXCEPTION 'invalid_admin_notes'; END IF;

  SELECT * INTO v_inc FROM public.player_incidents WHERE id = p_incident_id FOR UPDATE;
  IF v_inc.id IS NULL THEN RAISE EXCEPTION 'incident_not_found'; END IF;
  IF v_inc.status <> 'pending' THEN RAISE EXCEPTION 'incident_not_pending'; END IF;

  UPDATE public.player_incidents
     SET status = 'justified',
         justification = v_just,
         admin_notes = NULLIF(btrim(v_notes), ''),
         decided_by_admin_user_id = p_admin_user_id,
         decided_at = now(),
         updated_at = now()
   WHERE id = p_incident_id;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id, 'incident_justification_accepted', 'player_incident', p_incident_id,
          jsonb_build_object(
            'previous_status', v_inc.status,
            'new_status', 'justified',
            'incident_type', v_inc.incident_type,
            'event_id', v_inc.event_id,
            'player_id', v_inc.player_id,
            'justification_changed', true,
            'notes_changed', (NULLIF(btrim(v_notes), '') IS DISTINCT FROM v_inc.admin_notes)
          ));

  RETURN jsonb_build_object('status','ok','incident_id', p_incident_id, 'new_status','justified');
END;
$function$;

-- =========================================================
-- RPC: cancelar ocorrência
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_cancel_incident(
  p_incident_id uuid,
  p_admin_user_id uuid,
  p_admin_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inc public.player_incidents;
  v_notes text;
BEGIN
  IF p_admin_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_admin_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_notes := btrim(coalesce(p_admin_notes, ''));
  IF length(v_notes) < 3 OR length(v_notes) > 2000 THEN
    RAISE EXCEPTION 'invalid_admin_notes';
  END IF;

  SELECT * INTO v_inc FROM public.player_incidents WHERE id = p_incident_id FOR UPDATE;
  IF v_inc.id IS NULL THEN RAISE EXCEPTION 'incident_not_found'; END IF;
  IF v_inc.status <> 'pending' THEN RAISE EXCEPTION 'incident_not_pending'; END IF;

  UPDATE public.player_incidents
     SET status = 'cancelled',
         admin_notes = v_notes,
         decided_by_admin_user_id = p_admin_user_id,
         decided_at = now(),
         updated_at = now()
   WHERE id = p_incident_id;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id, 'incident_cancelled', 'player_incident', p_incident_id,
          jsonb_build_object(
            'previous_status', v_inc.status,
            'new_status', 'cancelled',
            'incident_type', v_inc.incident_type,
            'event_id', v_inc.event_id,
            'player_id', v_inc.player_id,
            'notes_changed', true
          ));

  RETURN jsonb_build_object('status','ok','incident_id', p_incident_id, 'new_status','cancelled');
END;
$function$;

-- =========================================================
-- RPC: atualizar observação administrativa
-- =========================================================
CREATE OR REPLACE FUNCTION public.admin_update_incident_notes(
  p_incident_id uuid,
  p_admin_user_id uuid,
  p_admin_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_inc public.player_incidents;
  v_notes text;
  v_new_notes text;
BEGIN
  IF p_admin_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_admin_user_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  v_notes := coalesce(p_admin_notes, '');
  IF length(v_notes) > 2000 THEN RAISE EXCEPTION 'invalid_admin_notes'; END IF;

  SELECT * INTO v_inc FROM public.player_incidents WHERE id = p_incident_id FOR UPDATE;
  IF v_inc.id IS NULL THEN RAISE EXCEPTION 'incident_not_found'; END IF;

  v_new_notes := NULLIF(btrim(v_notes), '');

  UPDATE public.player_incidents
     SET admin_notes = v_new_notes,
         updated_at = now()
   WHERE id = p_incident_id;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id, 'incident_notes_updated', 'player_incident', p_incident_id,
          jsonb_build_object(
            'previous_status', v_inc.status,
            'new_status', v_inc.status,
            'incident_type', v_inc.incident_type,
            'event_id', v_inc.event_id,
            'player_id', v_inc.player_id,
            'notes_changed', (v_new_notes IS DISTINCT FROM v_inc.admin_notes)
          ));

  RETURN jsonb_build_object('status','ok','incident_id', p_incident_id);
END;
$function$;

-- =========================================================
-- GRANTS: apenas service_role (owner é dono por padrão).
-- =========================================================
REVOKE ALL ON FUNCTION public.admin_accept_incident_justification(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_cancel_incident(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_incident_notes(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_accept_incident_justification(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_cancel_incident(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_incident_notes(uuid, uuid, text) TO service_role;
