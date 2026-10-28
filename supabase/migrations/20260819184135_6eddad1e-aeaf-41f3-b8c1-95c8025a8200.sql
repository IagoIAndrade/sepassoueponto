CREATE OR REPLACE FUNCTION public.fn_log_registration_withdrawal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_event_date date;
    v_group_id uuid;
    v_player_name text;
    v_deadline_time time;
    v_timezone text;
    v_deadline_status text;
    v_removal_source text;
    v_is_admin boolean := false;
BEGIN
    -- Only act on cancellation
    IF (OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL) THEN
        
        -- Get event and group info
        SELECT event_date, group_id INTO v_event_date, v_group_id
        FROM public.volleyball_events
        WHERE id = NEW.event_id;

        -- Get player name
        SELECT name INTO v_player_name
        FROM public.players
        WHERE id = NEW.player_id;

        -- Get group settings for deadline
        SELECT withdrawal_deadline_time, timezone
        INTO v_deadline_time, v_timezone
        FROM public.app_settings
        WHERE group_id = v_group_id;

        -- Determine source based on cancelled_by_player_id
        -- We check if the canceller is the player themselves or an admin
        IF NEW.cancelled_by_player_id IS NULL THEN
            v_removal_source := 'system';
        ELSIF NEW.cancelled_by_player_id = NEW.player_id THEN
            v_removal_source := 'player';
        ELSE
            -- Check if the canceller is an admin
            SELECT EXISTS (
                SELECT 1 FROM public.user_roles 
                WHERE user_id = NEW.cancelled_by_player_id AND role = 'admin'
            ) INTO v_is_admin;
            
            IF v_is_admin THEN
                v_removal_source := 'admin';
            ELSE
                -- If it's not the player and not an admin (unlikely), default to system
                v_removal_source := 'system';
            END IF;
        END IF;

        -- Determine deadline status
        IF now() > (v_event_date + COALESCE(v_deadline_time, '10:00:00'::time)) THEN
            v_deadline_status := 'late';
        ELSE
            v_deadline_status := 'in_time';
        END IF;

        INSERT INTO public.registration_withdrawals (
            event_id,
            group_id,
            registration_id,
            player_id,
            player_name_snapshot,
            removed_at,
            removed_by_id,
            removal_source,
            deadline_status,
            list_type_snapshot,
            metadata
        ) VALUES (
            NEW.event_id,
            v_group_id,
            NEW.id,
            NEW.player_id,
            COALESCE(v_player_name, 'Desconhecido'),
            NEW.cancelled_at,
            NEW.cancelled_by_player_id,
            v_removal_source,
            v_deadline_status,
            NEW.list_type,
            jsonb_build_object(
                'position_number', NEW.position_number,
                'created_at', NEW.created_at
            )
        );
    END IF;
    RETURN NEW;
END;
$function$;

-- Update any manual cancellation in admin_remove_registration_v3 to ensure it sets the admin ID
-- (This is already doing it, but verifying consistency)
-- Also ensuring promotions triggered by system (blocks) set cancelled_by_player_id to NULL 
-- to be identified as 'system' by the trigger above.

CREATE OR REPLACE FUNCTION public.admin_remove_registration_v3(p_registration_id uuid, p_admin_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record;
  v_event_id uuid;
  v_promoted uuid;
  v_wait_row record;
  v_next_pos int;
  v_temp_offset int := 10000;
BEGIN
  -- 1. Buscar a inscrição
  SELECT id, event_id, list_type, position_number, cancelled_at, player_id
  INTO v_reg 
  FROM public.registrations 
  WHERE id = p_registration_id
  FOR UPDATE;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found'; END IF;
  
  v_event_id := v_reg.event_id;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_event_id::text, 42));
  
  IF v_reg.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'message', 'already_cancelled');
  END IF;
  
  -- 4. Cancelar a inscrição (isso dispara o trigger fn_log_registration_withdrawal)
  UPDATE public.registrations 
  SET cancelled_at = now(), 
      cancelled_by_player_id = p_admin_user_id
  WHERE id = p_registration_id;
  
  -- 5. Reorganizar e promover
  IF v_reg.list_type::text = 'main' THEN
    UPDATE public.registrations 
    SET position_number = position_number + v_temp_offset
    WHERE event_id = v_event_id 
      AND list_type = 'main'::public.list_type
      AND cancelled_at IS NULL 
      AND position_number > v_reg.position_number;

    UPDATE public.registrations 
    SET position_number = (position_number - v_temp_offset) - 1
    WHERE event_id = v_event_id 
      AND list_type = 'main'::public.list_type
      AND cancelled_at IS NULL 
      AND position_number > v_temp_offset;
    
    FOR v_wait_row IN 
      SELECT id, player_id, position_number FROM public.registrations
      WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL
      ORDER BY position_number ASC
      FOR UPDATE
    LOOP
      IF public.internal_is_blocked(v_wait_row.player_id, (SELECT event_date FROM public.volleyball_events WHERE id = v_event_id)) THEN
         -- Removido pelo sistema (bloqueio)
         UPDATE public.registrations 
         SET cancelled_at = now(),
             cancelled_by_player_id = NULL -- Identifica como 'system' no trigger
         WHERE id = v_wait_row.id;
         
         UPDATE public.registrations SET position_number = position_number + v_temp_offset
         WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;
         
         UPDATE public.registrations SET position_number = (position_number - v_temp_offset) - 1
         WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_temp_offset;
         
         CONTINUE;
      END IF;
      
      SELECT coalesce(max(position_number), 0) + 1 INTO v_next_pos 
      FROM public.registrations
      WHERE event_id = v_event_id AND list_type = 'main'::public.list_type AND cancelled_at IS NULL;
      
      UPDATE public.registrations 
      SET list_type = 'main'::public.list_type, 
          position_number = v_next_pos 
      WHERE id = v_wait_row.id;
      
      UPDATE public.registrations SET position_number = position_number + v_temp_offset
      WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_wait_row.position_number;

      UPDATE public.registrations SET position_number = (position_number - v_temp_offset) - 1
      WHERE event_id = v_event_id AND list_type = 'wait'::public.list_type AND cancelled_at IS NULL AND position_number > v_temp_offset;
      
      v_promoted := v_wait_row.id;
      EXIT;
    END LOOP;
  ELSIF v_reg.list_type::text = 'wait' THEN
    UPDATE public.registrations 
    SET position_number = position_number + v_temp_offset
    WHERE event_id = v_event_id 
      AND list_type = 'wait'::public.list_type
      AND cancelled_at IS NULL 
      AND position_number > v_reg.position_number;

    UPDATE public.registrations 
    SET position_number = (position_number - v_temp_offset) - 1
    WHERE event_id = v_event_id 
      AND list_type = 'wait'::public.list_type
      AND cancelled_at IS NULL 
      AND position_number > v_temp_offset;
  END IF;
  
  BEGIN
    INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
    VALUES (p_admin_user_id, 'admin_remove_registration', 'registration', p_registration_id,
            jsonb_build_object('event_id', v_event_id, 'player_id', v_reg.player_id, 'promoted_id', v_promoted));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  
  RETURN jsonb_build_object('ok', true, 'cancelled_id', p_registration_id, 'promoted_id', v_promoted);
END;
$function$;