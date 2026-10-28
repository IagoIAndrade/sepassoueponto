ALTER TABLE public.app_settings 
  ADD COLUMN IF NOT EXISTS auto_open boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS auto_close boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS close_weekday integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS close_time time without time zone NOT NULL DEFAULT '23:59:59';

CREATE OR REPLACE FUNCTION public.internal_cycle_rounds()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group record;
  v_event record;
  v_now timestamptz := now();
  v_closed_count int := 0;
  v_created_count int := 0;
  v_opened_count int := 0;
  v_res jsonb;
  v_close_at timestamptz;
  v_delta int;
  v_msg text;
  v_base_date date;
BEGIN
  FOR v_event IN 
    SELECT e.id, e.event_date, e.status, e.group_id, e.opens_at, e.manual_override, 
           s.auto_open, s.auto_close, s.close_weekday, s.close_time, s.timezone, s.event_weekday
    FROM public.volleyball_events e
    JOIN public.app_settings s ON s.group_id = e.group_id
    WHERE e.status IN ('scheduled', 'open', 'closed')
  LOOP
    IF v_event.status = 'scheduled' AND v_event.auto_open = true AND v_event.manual_override = false AND v_event.opens_at <= v_now THEN
      BEGIN
        PERFORM public.internal_process_event_opening(v_event.id, false);
        v_opened_count := v_opened_count + 1;
      EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
        INSERT INTO public.admin_actions_log (action, target_type, target_id, details)
        VALUES ('AUTO_ROUND_OPEN_ERROR', 'event', v_event.id, jsonb_build_object('error', v_msg));
      END;
    END IF;

    IF v_event.status IN ('open', 'closed') AND v_event.auto_close = true AND v_event.manual_override = false THEN
      v_delta := (v_event.close_weekday - v_event.event_weekday + 7) % 7;
      v_base_date := v_event.event_date + v_delta;
      v_close_at := (v_base_date::text || ' ' || v_event.close_time::text || ':00-03:00')::timestamp with time zone;
      
      IF v_now >= v_close_at THEN
        UPDATE public.volleyball_events SET status = 'completed' WHERE id = v_event.id;
        INSERT INTO public.admin_actions_log (action, target_type, target_id, details)
        VALUES ('AUTO_ROUND_CLOSE', 'event', v_event.id, jsonb_build_object('event_date', v_event.event_date, 'previous_status', v_event.status));
        v_closed_count := v_closed_count + 1;
      END IF;
    END IF;
  END LOOP;

  FOR v_group IN 
    SELECT id FROM public.groups WHERE active = true ORDER BY sort_order
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.volleyball_events WHERE group_id = v_group.id AND status IN ('scheduled', 'open', 'closed')
    ) THEN
      BEGIN
        v_res := public.internal_create_next_event(v_group.id);
        IF v_res->>'status' = 'created' THEN
          v_created_count := v_created_count + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_msg := SQLERRM;
        INSERT INTO public.admin_actions_log (action, target_type, target_id, details)
        VALUES ('AUTO_ROUND_CREATE_ERROR', 'group', v_group.id, jsonb_build_object('error', v_msg));
      END;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'closed', v_closed_count, 'opened', v_opened_count, 'created', v_created_count, 'executed_at', v_now);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_app_settings(p_group_id uuid, p_auto_open boolean, p_auto_close boolean, p_close_weekday integer, p_close_time time without time zone)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  UPDATE public.app_settings
  SET auto_open = p_auto_open,
      auto_close = p_auto_close,
      close_weekday = p_close_weekday,
      close_time = p_close_time
  WHERE group_id = p_group_id;
END;
$function$;
