CREATE OR REPLACE FUNCTION public.admin_set_event_status(
  p_event_id uuid,
  p_status public.event_status,
  p_manual_override boolean,
  p_admin_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_gid uuid;
  v_default_priority integer;
  v_effective_opens_at timestamptz;
  v_effective_priority integer;
  v_caller_id uuid := auth.uid();
BEGIN
  IF v_caller_id IS NULL OR NOT public.has_role(v_caller_id, 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin_required' USING ERRCODE = '42501';
  END IF;

  IF p_admin_user_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION 'admin_identity_mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT group_id
    INTO v_gid
    FROM public.volleyball_events
   WHERE id = p_event_id;

  IF v_gid IS NULL THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  SELECT priority_minutes
    INTO v_default_priority
    FROM public.app_settings
   WHERE group_id = v_gid;

  v_effective_priority := COALESCE(v_default_priority, 0);
  v_effective_opens_at := now();

  UPDATE public.volleyball_events
     SET status = p_status,
         manual_override = p_manual_override,
         opens_at = CASE WHEN p_status = 'open' THEN v_effective_opens_at ELSE opens_at END,
         priority_minutes = CASE WHEN p_status = 'open' THEN v_effective_priority ELSE priority_minutes END
   WHERE id = p_event_id;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (
    v_caller_id,
    'admin_set_event_status',
    'event',
    p_event_id,
    jsonb_build_object(
      'status', p_status,
      'manual_override', p_manual_override,
      'group_id', v_gid
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_set_event_status(uuid, public.event_status, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_event_status(uuid, public.event_status, boolean, uuid) TO authenticated, service_role;