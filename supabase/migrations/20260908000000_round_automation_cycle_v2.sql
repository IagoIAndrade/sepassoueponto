-- Migration: Automação e verificação estrita por event_id usando America/Sao_Paulo

ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS auto_open BOOLEAN DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS auto_close BOOLEAN DEFAULT true;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS close_weekday INTEGER;
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS close_time TIME;

CREATE OR REPLACE FUNCTION admin_update_automation(
  p_group_id UUID,
  p_auto_open BOOLEAN,
  p_auto_close BOOLEAN,
  p_close_weekday INTEGER,
  p_close_time TIME
) RETURNS void AS $$
BEGIN
  UPDATE app_settings
  SET auto_open = p_auto_open,
      auto_close = p_auto_close,
      close_weekday = p_close_weekday,
      close_time = p_close_time
  WHERE group_id = p_group_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_public_current_event(p_group_id UUID DEFAULT NULL) 
RETURNS TABLE (
  id UUID,
  event_date DATE,
  opens_at TIMESTAMP WITH TIME ZONE,
  status TEXT,
  location TEXT,
  start_time TIME,
  end_time TIME,
  main_limit INTEGER,
  group_id UUID
) AS $$
DECLARE
  v_event RECORD;
  v_now TIMESTAMP WITH TIME ZONE := (now() AT TIME ZONE 'America/Sao_Paulo');
  v_opens_at_sp TIMESTAMP WITH TIME ZONE;
  v_closes_at_sp TIMESTAMP WITH TIME ZONE;
  v_close_weekday INTEGER;
  v_close_time TIME;
  v_auto_open BOOLEAN;
  v_auto_close BOOLEAN;
BEGIN
  SELECT e.*
  INTO v_event
  FROM volleyball_events e
  WHERE (p_group_id IS NULL OR e.group_id = p_group_id)
    AND e.status IN ('scheduled', 'open')
  ORDER BY e.event_date ASC, e.start_time ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT auto_open, auto_close, close_weekday, close_time
  INTO v_auto_open, v_auto_close, v_close_weekday, v_close_time
  FROM app_settings WHERE group_id = v_event.group_id;

  v_opens_at_sp := v_event.opens_at AT TIME ZONE 'America/Sao_Paulo';
  
  -- Calcular close_at com base na configuração
  IF v_close_weekday IS NOT NULL AND v_close_time IS NOT NULL THEN
    v_closes_at_sp := (v_opens_at_sp::date + v_close_time) AT TIME ZONE 'America/Sao_Paulo';
    v_closes_at_sp := v_closes_at_sp + ((v_close_weekday - EXTRACT(DOW FROM v_closes_at_sp)::integer + 7) % 7 || ' days')::interval;
    IF v_closes_at_sp <= v_opens_at_sp THEN
       v_closes_at_sp := v_closes_at_sp + interval '7 days';
    END IF;
  ELSE
    -- fallback
    v_closes_at_sp := (v_event.event_date + interval '1 day')::timestamp AT TIME ZONE 'America/Sao_Paulo';
  END IF;

  -- Abertura automática sever-side em tempo real
  IF v_event.status = 'scheduled' AND v_event.opens_at IS NOT NULL AND v_now >= v_opens_at_sp THEN
    IF v_auto_open = true THEN
        UPDATE volleyball_events SET status = 'open' WHERE id = v_event.id;
        v_event.status := 'open';
    END IF;
  END IF;

  -- Encerramento automático
  IF v_event.status = 'open' AND v_now >= v_closes_at_sp THEN
    IF v_auto_close = true THEN
        UPDATE volleyball_events SET status = 'closed' WHERE id = v_event.id;
        v_event.status := 'closed';
    END IF;
  END IF;

  RETURN QUERY SELECT 
    v_event.id, 
    v_event.event_date, 
    v_event.opens_at, 
    v_event.status, 
    v_event.location, 
    v_event.start_time, 
    v_event.end_time, 
    v_event.main_limit, 
    v_event.group_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
