-- Helper interno: processa um bloqueio ativo cancelando inscrições afetadas e promovendo reservas
CREATE OR REPLACE FUNCTION public.internal_process_active_block(
  p_block_id uuid,
  p_admin_user_id uuid,
  p_fail_after int DEFAULT NULL
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_block public.player_blocks;
  v_evt   record;
  v_reg   public.registrations;
  v_wait  public.registrations;
  v_next_pos int;
  v_processed int := 0;
BEGIN
  SELECT * INTO v_block FROM public.player_blocks WHERE id = p_block_id;
  IF v_block.id IS NULL OR NOT v_block.active THEN
    RAISE EXCEPTION 'block_not_found_or_inactive';
  END IF;

  FOR v_evt IN
    SELECT e.id, e.event_date
      FROM public.volleyball_events e
     WHERE e.event_date BETWEEN v_block.starts_at AND v_block.ends_at
       AND e.status <> 'finished'
       AND EXISTS (
         SELECT 1 FROM public.registrations r
          WHERE r.event_id = e.id
            AND r.player_id = v_block.player_id
            AND r.cancelled_at IS NULL
       )
     ORDER BY e.event_date ASC, e.id ASC
  LOOP
    PERFORM public.lock_event(v_evt.id);

    SELECT * INTO v_reg FROM public.registrations
     WHERE event_id = v_evt.id
       AND player_id = v_block.player_id
       AND cancelled_at IS NULL
     LIMIT 1;

    IF v_reg.id IS NULL THEN
      CONTINUE;
    END IF;

    UPDATE public.registrations
       SET cancelled_at = now(), cancelled_by_player_id = NULL
     WHERE id = v_reg.id;

    INSERT INTO public.admin_actions_log
      (admin_user_id, action, target_type, target_id, details)
    VALUES (p_admin_user_id, 'block_cancel_registration','registration', v_reg.id,
            jsonb_build_object('block_id', p_block_id,
                               'event_id', v_evt.id,
                               'player_id', v_block.player_id,
                               'from_list', v_reg.list_type,
                               'from_pos', v_reg.position_number));

    IF v_reg.list_type = 'main' THEN
      UPDATE public.registrations SET position_number = position_number + 100000
       WHERE event_id = v_evt.id AND list_type = 'main'
         AND cancelled_at IS NULL AND position_number > v_reg.position_number;
      UPDATE public.registrations SET position_number = position_number - 100001
       WHERE event_id = v_evt.id AND list_type = 'main'
         AND cancelled_at IS NULL AND position_number > 100000;

      LOOP
        SELECT * INTO v_wait FROM public.registrations
         WHERE event_id = v_evt.id AND list_type = 'wait'
           AND cancelled_at IS NULL
         ORDER BY position_number ASC LIMIT 1;
        EXIT WHEN v_wait.id IS NULL;

        IF public.internal_is_blocked(v_wait.player_id, v_evt.event_date) THEN
          UPDATE public.registrations SET cancelled_at = now()
           WHERE id = v_wait.id;
          UPDATE public.registrations SET position_number = position_number + 100000
           WHERE event_id = v_evt.id AND list_type = 'wait'
             AND cancelled_at IS NULL AND position_number > v_wait.position_number;
          UPDATE public.registrations SET position_number = position_number - 100001
           WHERE event_id = v_evt.id AND list_type = 'wait'
             AND cancelled_at IS NULL AND position_number > 100000;
          INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
          VALUES (p_admin_user_id, 'skip_blocked_on_promote','registration', v_wait.id,
                  jsonb_build_object('event_id', v_evt.id, 'block_id', p_block_id));
          CONTINUE;
        END IF;

        SELECT coalesce(max(position_number),0)+1 INTO v_next_pos
          FROM public.registrations
         WHERE event_id = v_evt.id AND list_type = 'main' AND cancelled_at IS NULL;
        UPDATE public.registrations
           SET list_type = 'main', position_number = v_next_pos
         WHERE id = v_wait.id;
        UPDATE public.registrations SET position_number = position_number + 100000
         WHERE event_id = v_evt.id AND list_type = 'wait'
           AND cancelled_at IS NULL AND position_number > v_wait.position_number;
        UPDATE public.registrations SET position_number = position_number - 100001
         WHERE event_id = v_evt.id AND list_type = 'wait'
           AND cancelled_at IS NULL AND position_number > 100000;
        EXIT;
      END LOOP;
    ELSE
      UPDATE public.registrations SET position_number = position_number + 100000
       WHERE event_id = v_evt.id AND list_type = 'wait'
         AND cancelled_at IS NULL AND position_number > v_reg.position_number;
      UPDATE public.registrations SET position_number = position_number - 100001
       WHERE event_id = v_evt.id AND list_type = 'wait'
         AND cancelled_at IS NULL AND position_number > 100000;
    END IF;

    v_processed := v_processed + 1;
    IF p_fail_after IS NOT NULL AND v_processed >= p_fail_after THEN
      RAISE EXCEPTION 'forced_failure_after_%_events', v_processed;
    END IF;
  END LOOP;

  RETURN v_processed;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.internal_process_active_block(uuid,uuid,int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.internal_process_active_block(uuid,uuid,int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.internal_process_active_block(uuid,uuid,int) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.internal_process_active_block(uuid,uuid,int) TO service_role;

-- admin_block_player transacional
CREATE OR REPLACE FUNCTION public.admin_block_player(
  p_player_id uuid,
  p_starts_at date,
  p_ends_at date,
  p_reason text,
  p_admin_notes text,
  p_admin_user_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_processed int;
BEGIN
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at < p_starts_at THEN
    RAISE EXCEPTION 'invalid_block_range';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'player_not_found';
  END IF;

  INSERT INTO public.player_blocks
    (player_id, starts_at, ends_at, reason, admin_notes, created_by_admin_user_id)
  VALUES (p_player_id, p_starts_at, p_ends_at, p_reason, p_admin_notes, p_admin_user_id)
  RETURNING id INTO v_id;

  v_processed := public.internal_process_active_block(v_id, p_admin_user_id, NULL);

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id, 'admin_block_player', 'player_block', v_id,
          jsonb_build_object('player_id', p_player_id,
                             'starts_at', p_starts_at,
                             'ends_at', p_ends_at,
                             'registrations_cancelled', v_processed));
  RETURN v_id;
END;
$function$;

-- Wrapper de teste para D6 (rollback forçado)
CREATE OR REPLACE FUNCTION public.test_admin_block_with_failure(
  p_player_id uuid,
  p_starts_at date,
  p_ends_at date,
  p_admin_user_id uuid,
  p_fail_after int
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $function$
DECLARE v_id uuid;
BEGIN
  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at < p_starts_at THEN
    RAISE EXCEPTION 'invalid_block_range';
  END IF;
  INSERT INTO public.player_blocks
    (player_id, starts_at, ends_at, reason, admin_notes, created_by_admin_user_id)
  VALUES (p_player_id, p_starts_at, p_ends_at, 'test-d6', 'test-d6', p_admin_user_id)
  RETURNING id INTO v_id;

  PERFORM public.internal_process_active_block(v_id, p_admin_user_id, p_fail_after);
  RETURN v_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.test_admin_block_with_failure(uuid,date,date,uuid,int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.test_admin_block_with_failure(uuid,date,date,uuid,int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.test_admin_block_with_failure(uuid,date,date,uuid,int) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.test_admin_block_with_failure(uuid,date,date,uuid,int) TO service_role;