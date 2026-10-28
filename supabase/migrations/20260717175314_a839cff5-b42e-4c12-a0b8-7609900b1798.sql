
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

  -- Cálculo do prazo somente quando o snapshot de regras existir na rodada
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

  -- Cancela inscrição
  UPDATE public.registrations
     SET cancelled_at = v_now, cancelled_by_player_id = p_requester_player_id
   WHERE id = p_registration_id;

  -- Renumeração + promoção (cópia fiel da lógica atual)
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

  -- Ocorrência de retirada após o prazo (mesma transação)
  IF v_is_late THEN
    INSERT INTO public.player_incidents
      (event_id, player_id, incident_type, occurred_at, suggested_rounds, status)
    VALUES
      (v_reg.event_id, v_reg.player_id, 'late_leave', v_now, v_penalty, 'pending')
    ON CONFLICT (event_id, player_id, incident_type) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'cancelled_id', p_registration_id,
    'promoted_id', v_promoted,
    'late_leave_recorded', v_is_late
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.internal_leave_registration_v2(uuid, uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_leave_registration_v2(uuid, uuid, boolean) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v2(uuid, uuid, boolean) TO service_role;

-- Substitui corpo da função legada para delegar à v2 com confirmação = false.
CREATE OR REPLACE FUNCTION public.internal_leave_registration(
  p_registration_id uuid,
  p_requester_player_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  RETURN public.internal_leave_registration_v2(p_registration_id, p_requester_player_id, false);
END;
$function$;

REVOKE ALL ON FUNCTION public.internal_leave_registration(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_leave_registration(uuid, uuid) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_leave_registration(uuid, uuid) TO service_role;
