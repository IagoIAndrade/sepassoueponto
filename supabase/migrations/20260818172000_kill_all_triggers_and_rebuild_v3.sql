-- Drop de triggers e recriação da RPC v3 com o nome original esperado pelo frontend.

DROP TRIGGER IF EXISTS tr_notify_promotion ON public.registrations;
DROP TRIGGER IF EXISTS tr_update_counts ON public.registrations;
DROP TRIGGER IF EXISTS tr_audit_registrations ON public.registrations;

CREATE OR REPLACE FUNCTION public.admin_remove_registration_v3(
  p_registration_id uuid,
  p_admin_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reg record;
  v_event_id uuid;
  v_promoted_reg_id uuid := NULL;
  v_wait_row record;
  v_next_pos int;
  v_event_date date;
BEGIN
  -- 1. Lock da inscrição
  SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  
  v_event_id := v_reg.event_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_event_id::text, 42));
  
  IF v_reg.cancelled_at IS NOT NULL THEN RETURN jsonb_build_object('ok', true, 'msg', 'already_cancelled'); END IF;
  
  SELECT event_date INTO v_event_date FROM public.volleyball_events WHERE id = v_event_id;
  
  -- 2. Cancelar
  UPDATE public.registrations 
  SET cancelled_at = now(), 
      cancelled_by_player_id = p_admin_user_id 
  WHERE id = p_registration_id;
  
  -- 3. Se era titular, promove reserva
  IF v_reg.list_type::text = 'main' THEN
    UPDATE public.registrations 
    SET position_number = position_number - 1 
    WHERE event_id = v_event_id 
      AND list_type = 'main'::public.list_type 
      AND cancelled_at IS NULL 
      AND position_number > v_reg.position_number;
    
    FOR v_wait_row IN 
      SELECT * FROM public.registrations 
      WHERE event_id = v_event_id 
        AND list_type = 'wait'::public.list_type 
        AND cancelled_at IS NULL 
      ORDER BY position_number ASC FOR UPDATE
    LOOP
      IF public.internal_is_blocked(v_wait_row.player_id, v_event_date) THEN
         UPDATE public.registrations 
         SET cancelled_at = now(), 
             cancelled_by_player_id = p_admin_user_id 
         WHERE id = v_wait_row.id;
         
         UPDATE public.registrations 
         SET position_number = position_number - 1 
         WHERE event_id = v_event_id 
           AND list_type = 'wait'::public.list_type 
           AND cancelled_at IS NULL 
           AND position_number > v_wait_row.position_number;
         CONTINUE;
      END IF;
      
      SELECT coalesce(max(position_number), 0) + 1 INTO v_next_pos 
      FROM public.registrations 
      WHERE event_id = v_event_id 
        AND list_type = 'main'::public.list_type 
        AND cancelled_at IS NULL;
      
      UPDATE public.registrations 
      SET list_type = 'main'::public.list_type, 
          position_number = v_next_pos 
      WHERE id = v_wait_row.id;
      
      UPDATE public.registrations 
      SET position_number = position_number - 1 
      WHERE event_id = v_event_id 
        AND list_type = 'wait'::public.list_type 
        AND cancelled_at IS NULL 
        AND position_number > v_wait_row.position_number;
        
      v_promoted_reg_id := v_wait_row.id;
      EXIT;
    END LOOP;
  ELSE
    UPDATE public.registrations 
    SET position_number = position_number - 1 
    WHERE event_id = v_event_id 
      AND list_type = 'wait'::public.list_type 
      AND cancelled_at IS NULL 
      AND position_number > v_reg.position_number;
  END IF;
  
  RETURN jsonb_build_object('ok', true, 'cancelled_id', p_registration_id, 'promoted_id', v_promoted_reg_id);
END;
$$;
