-- Migration: Allow reapply after rejection with 24h cooldown (server-side validation)
-- Preserves rejection history via admin_actions_log. Does NOT delete old records.

CREATE OR REPLACE FUNCTION public.get_server_now()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT now()::text;
$function$;

-- 1. Replace player_request_group_access to support 24h reapply after rejection
CREATE OR REPLACE FUNCTION public.player_request_group_access(p_token text, p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_player_id uuid;
  v_status player_group_status;
  v_reason text;
  v_processed_at timestamptz;
  v_hours_since numeric;
BEGIN
  SELECT public.internal_validate_session(p_token) INTO v_player_id;
  IF v_player_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT status, rejection_reason, processed_at
    INTO v_status, v_reason, v_processed_at
    FROM public.player_groups
   WHERE player_id = v_player_id AND group_id = p_group_id;

  IF v_status = 'pending' THEN
    RAISE EXCEPTION 'Já existe uma solicitação aguardando análise.';
  ELSIF v_status = 'approved' THEN
    RAISE EXCEPTION 'Você já possui acesso a esta turma.';
  ELSIF v_status = 'rejected' THEN
    -- Check 24h cooldown using server time
    IF v_processed_at IS NOT NULL THEN
      v_hours_since := EXTRACT(EPOCH FROM (now() - v_processed_at)) / 3600.0;
      IF v_hours_since < 24 THEN
        RAISE EXCEPTION 'cooldown_active::%', v_processed_at::text;
      END IF;
    END IF;

    -- Log the reapply action preserving old rejection info
    INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
    VALUES (NULL, 'player_reapply_after_rejection', 'player', v_player_id,
            jsonb_build_object(
              'group_id', p_group_id,
              'previous_status', 'rejected',
              'previous_reason', v_reason,
              'previous_processed_at', v_processed_at,
              'reapplied_at', now()
            ));

    -- Reset to pending
    UPDATE public.player_groups
       SET status = 'pending',
           requested_at = now(),
           processed_at = NULL,
           processed_by = NULL,
           rejection_reason = NULL
     WHERE player_id = v_player_id AND group_id = p_group_id;
  ELSIF v_status IS NOT NULL THEN
    -- Other statuses (suspended, etc.): reset to pending
    UPDATE public.player_groups
       SET status = 'pending',
           requested_at = now(),
           processed_at = NULL,
           processed_by = NULL,
           rejection_reason = NULL
     WHERE player_id = v_player_id AND group_id = p_group_id;
  ELSE
    -- No record exists: create new pending request
    INSERT INTO public.player_groups (player_id, group_id, status)
    VALUES (v_player_id, p_group_id, 'pending');
  END IF;
END;
$function$;
