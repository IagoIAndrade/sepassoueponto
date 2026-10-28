ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS attendance_status text DEFAULT 'unverified';
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS verified_at timestamptz;
ALTER TABLE public.registrations ADD COLUMN IF NOT EXISTS verified_by_admin_user_id uuid REFERENCES auth.users(id);

CREATE OR REPLACE FUNCTION public.admin_save_attendance(p_event_id uuid, p_attendances jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_event record;
  v_item jsonb;
  v_reg_id uuid;
  v_status text;
  v_processed int := 0;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT e.id, e.status, e.event_date, s.timezone 
  INTO v_event 
  FROM public.volleyball_events e
  LEFT JOIN public.app_settings s ON s.group_id = e.group_id
  WHERE e.id = p_event_id;
  
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;

  IF v_event.status = 'cancelled' THEN
    RAISE EXCEPTION 'event_cancelled';
  END IF;

  IF v_event.event_date > (now() AT TIME ZONE COALESCE(v_event.timezone, 'America/Sao_Paulo'))::date THEN
    RAISE EXCEPTION 'future_event';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_attendances) LOOP
    v_reg_id := (v_item->>'registration_id')::uuid;
    v_status := v_item->>'status';
    
    IF v_status NOT IN ('present', 'absent', 'unverified') THEN
      RAISE EXCEPTION 'invalid_status';
    END IF;

    UPDATE public.registrations
    SET attendance_status = v_status,
        verified_at = now(),
        verified_by_admin_user_id = v_admin
    WHERE id = v_reg_id AND event_id = p_event_id;

    v_processed := v_processed + 1;
  END LOOP;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_admin, 'admin_save_attendance', 'event', p_event_id, 
          jsonb_build_object('processed', v_processed));

  RETURN jsonb_build_object('ok', true, 'processed', v_processed);
END;
$$;