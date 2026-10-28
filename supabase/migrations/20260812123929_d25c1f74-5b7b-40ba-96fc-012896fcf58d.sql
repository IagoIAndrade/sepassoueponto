CREATE OR REPLACE FUNCTION public.admin_set_event_status(p_event_id uuid, p_status public.event_status, p_manual_override boolean, p_admin_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_gid uuid;
  v_default_priority integer;
  v_effective_opens_at timestamptz;
  v_effective_priority integer;
  v_caller_id uuid := auth.uid();
BEGIN
  -- Basic security check
  IF v_caller_id IS NULL OR NOT public.has_role(v_caller_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  IF p_admin_user_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'admin_identity_mismatch' USING ERRCODE = '42501';
  END IF;

  -- If the action is to OPEN the list, use the canonical process instead of just updating the status
  IF p_status = 'open' THEN
    -- This internal function handles locks, organizers enrollment and status update atomicity
    PERFORM public.internal_process_event_opening(p_event_id);
  ELSE
    -- For other statuses (closed, cancelled, etc.), keep the previous logic
    SELECT group_id
      INTO v_gid
      FROM public.volleyball_events
     WHERE id = p_event_id;

    IF v_gid IS NULL THEN
      RAISE EXCEPTION 'event_not_found';
    END IF;

    UPDATE public.volleyball_events
       SET status = p_status,
           manual_override = p_manual_override
     WHERE id = p_event_id;
  END IF;

  -- Log action
  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    'admin_set_event_status',
    'event',
    p_event_id,
    jsonb_build_object(
      'status', p_status,
      'manual_override', p_manual_override
    )
  );
END;
$$;
