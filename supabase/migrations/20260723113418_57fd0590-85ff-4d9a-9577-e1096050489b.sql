CREATE OR REPLACE FUNCTION public.admin_set_event_status(
  p_event_id uuid,
  p_status public.event_status,
  p_manual_override boolean,
  p_admin_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_default_priority int;
  v_effective_opens_at timestamptz;
  v_effective_priority int;
BEGIN
  SELECT priority_minutes
    INTO v_default_priority
  FROM public.app_settings
  ORDER BY created_at ASC
  LIMIT 1;

  v_effective_priority := COALESCE(v_default_priority, 0);
  v_effective_opens_at := now();

  UPDATE public.volleyball_events
     SET status = p_status,
         manual_override = p_manual_override,
         opens_at = CASE
           WHEN p_status = 'open' THEN v_effective_opens_at
           ELSE opens_at
         END,
         priority_minutes = CASE
           WHEN p_status = 'open' THEN v_effective_priority
           ELSE priority_minutes
         END
   WHERE id = p_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (
    p_admin_user_id,
    'admin_set_event_status',
    'event',
    p_event_id,
    jsonb_build_object(
      'status', p_status,
      'manual_override', p_manual_override,
      'priority_minutes', CASE WHEN p_status = 'open' THEN v_effective_priority ELSE NULL END,
      'opens_at', CASE WHEN p_status = 'open' THEN v_effective_opens_at ELSE NULL END
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_event_status(uuid, public.event_status, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_event_status(uuid, public.event_status, boolean, uuid) TO service_role;