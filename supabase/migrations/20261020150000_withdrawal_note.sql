ALTER TABLE public.player_incidents ADD COLUMN IF NOT EXISTS withdrawal_note text;
ALTER TABLE public.registration_withdrawals ADD COLUMN IF NOT EXISTS withdrawal_note text;
ALTER TABLE public.player_incidents DROP CONSTRAINT IF EXISTS player_incidents_withdrawal_note_len;
ALTER TABLE public.player_incidents ADD CONSTRAINT player_incidents_withdrawal_note_len CHECK (withdrawal_note IS NULL OR char_length(withdrawal_note) <= 500);
ALTER TABLE public.registration_withdrawals DROP CONSTRAINT IF EXISTS registration_withdrawals_withdrawal_note_len;
ALTER TABLE public.registration_withdrawals ADD CONSTRAINT registration_withdrawals_withdrawal_note_len CHECK (withdrawal_note IS NULL OR char_length(withdrawal_note) <= 500);

DROP FUNCTION IF EXISTS public.internal_leave_registration_v3(uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public.internal_leave_registration_v3(p_registration_id uuid, p_player_id uuid, p_confirm_late_leave boolean DEFAULT false, p_note text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_reg record;
    v_event record;
    v_settings record;
    v_deadline_ts timestamptz;
    v_is_late boolean;
    v_incident_id uuid;
    v_target_date date;
    v_loop_date date;
    v_i int;
    v_penalty_rounds int;
    v_is_guest boolean;
    v_note text;
BEGIN
    v_note := NULLIF(btrim(COALESCE(p_note, '')), '');
    IF v_note IS NOT NULL AND char_length(v_note) > 500 THEN
        RAISE EXCEPTION 'A observação deve ter no máximo 500 caracteres.';
    END IF;

    SELECT * INTO v_reg FROM public.registrations 
    WHERE id = p_registration_id 
      AND (player_id = p_player_id OR registered_by_player_id = p_player_id) 
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found'; END IF;
    IF v_reg.cancelled_at IS NOT NULL THEN 
        RETURN jsonb_build_object('status', 'already_cancelled', 'ok', true); 
    END IF;

    SELECT COALESCE(is_guest, false) INTO v_is_guest FROM public.players WHERE id = v_reg.player_id;
    SELECT * INTO v_event FROM public.volleyball_events WHERE id = v_reg.event_id;
    SELECT * INTO v_settings FROM public.app_settings WHERE group_id = v_event.group_id;

    v_deadline_ts := (
        (v_event.event_date - ((EXTRACT(DOW FROM v_event.event_date)::int - v_settings.withdrawal_deadline_weekday + 7) % 7))::timestamp 
        + v_settings.withdrawal_deadline_time
    ) AT TIME ZONE v_settings.timezone;

    v_is_late := now() > v_deadline_ts;
    v_penalty_rounds := COALESCE(v_settings.penalty_late_leave, 2);

    IF v_is_late AND NOT p_confirm_late_leave AND NOT v_is_guest THEN
        RETURN jsonb_build_object(
            'status', 'late_leave_confirmation_required', 'ok', false,
            'deadline_at', v_deadline_ts, 'penalty_late_leave', v_penalty_rounds,
            'timezone', v_settings.timezone
        );
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(v_reg.event_id::text, 42));

    UPDATE public.registrations 
    SET cancelled_at = now(), cancelled_by_player_id = p_player_id, cancelled_by_admin_user_id = NULL 
    WHERE id = p_registration_id;

    -- Observação gravada no registro de retirada criado pelo trigger (mesma transação)
    IF v_note IS NOT NULL THEN
        UPDATE public.registration_withdrawals SET withdrawal_note = v_note
        WHERE registration_id = p_registration_id
          AND id = (SELECT id FROM public.registration_withdrawals WHERE registration_id = p_registration_id ORDER BY created_at DESC LIMIT 1);
    END IF;

    IF v_is_late AND NOT v_is_guest THEN
        INSERT INTO public.player_incidents (
            player_id, event_id, group_id, incident_type, occurred_at,
            suggested_rounds, status, justification, scope, withdrawal_note
        )
        VALUES (
            v_reg.player_id, v_reg.event_id, v_event.group_id, 'late_leave', now(),
            v_penalty_rounds, 'pending', 'Saída confirmada após o prazo', 'group', v_note
        )
        ON CONFLICT (player_id, event_id, incident_type) DO UPDATE
          SET occurred_at = now(),
              withdrawal_note = COALESCE(EXCLUDED.withdrawal_note, public.player_incidents.withdrawal_note)
        RETURNING id INTO v_incident_id;

        IF v_penalty_rounds > 0 THEN
            v_i := 0;
            v_loop_date := v_event.event_date;
            WHILE v_i < v_penalty_rounds LOOP
                SELECT event_date INTO v_target_date 
                FROM public.volleyball_events 
                WHERE group_id = v_event.group_id AND event_date > v_loop_date 
                  AND status NOT IN ('completed', 'cancelled')
                ORDER BY event_date ASC LIMIT 1;
                IF NOT FOUND THEN v_target_date := v_loop_date + interval '7 days'; END IF;
                INSERT INTO public.player_blocks (player_id, group_id, starts_at, ends_at, reason, active, scope)
                VALUES (v_reg.player_id, v_event.group_id, v_target_date, v_target_date,
                        'Saída tardia da rodada ' || v_event.event_date, true, 'group');
                v_loop_date := v_target_date;
                v_i := v_i + 1;
            END LOOP;
        END IF;
    END IF;

    RETURN jsonb_build_object('status', 'success', 'ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.internal_leave_registration_v3(uuid, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v3(uuid, uuid, boolean, text) TO service_role;
