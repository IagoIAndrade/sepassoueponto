-- Migration: 20260915000000_registration_reminders.sql

-- 1. Add idempotency key to notifications table to prevent duplicate reminders
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS idempotency_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_idempotency_key ON public.notifications(idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 2. Create the reminder processor function
CREATE OR REPLACE FUNCTION public.process_registration_reminders()
RETURNS void AS $$
DECLARE
  v_event record;
  v_base_date date;
  v_event_dow integer;
  v_diff integer;
  v_open_date date;
  v_open_timestamp timestamptz;
  v_general_timestamp timestamptz;
  v_guest_timestamp timestamptz;
  v_now timestamptz := now();
  v_player record;
BEGIN
  -- Loop through active events
  FOR v_event IN
    SELECT e.id, e.event_date, e.status, e.group_id,
           s.open_weekday, s.open_time, s.priority_minutes,
           s.convidados_habilitados, s.dia_liberacao_convidado, s.hora_liberacao_convidado, s.limite_convidados_por_usuario,
           (SELECT name FROM class_groups WHERE id = e.group_id) as group_name
    FROM public.volleyball_events e
    JOIN public.class_settings s ON s.group_id = e.group_id
    WHERE e.status IN ('scheduled', 'open')
  LOOP
    v_base_date := e.event_date;
    v_event_dow := EXTRACT(DOW FROM v_base_date);
    
    -- Priority / Base Open Time
    v_diff := (v_event_dow - v_event.open_weekday + 7) % 7;
    v_open_date := v_base_date - v_diff;
    v_open_timestamp := (v_open_date::text || ' ' || v_event.open_time::text)::timestamp AT TIME ZONE 'America/Sao_Paulo';
    
    -- General Open Time
    v_general_timestamp := v_open_timestamp + (COALESCE(v_event.priority_minutes, 0) || ' minutes')::interval;
    
    -- Guest Release Time
    IF v_event.convidados_habilitados AND v_event.dia_liberacao_convidado IS NOT NULL AND v_event.hora_liberacao_convidado IS NOT NULL THEN
      v_diff := (v_event_dow - v_event.dia_liberacao_convidado + 7) % 7;
      v_guest_timestamp := ( (v_base_date - v_diff)::text || ' ' || v_event.hora_liberacao_convidado::text )::timestamp AT TIME ZONE 'America/Sao_Paulo';
    ELSE
      v_guest_timestamp := NULL;
    END IF;

    -- 1. Priority Reminder (1 min before priority opens, or everyone if no priority window)
    IF v_event.status = 'scheduled' AND v_now >= v_open_timestamp - interval '1 minute' AND v_now < v_open_timestamp THEN
      FOR v_player IN
        SELECT p.id, p.name, p.has_global_priority
        FROM public.players p
        JOIN public.player_group_access pga ON pga.player_id = p.id
        JOIN public.player_push_preferences pref ON pref.player_id = p.id
        WHERE pga.group_id = v_event.group_id
          AND pga.status = 'approved'
          AND pref.notify_registration_open = true
          AND (v_event.priority_minutes = 0 OR p.has_global_priority = true)
          AND EXISTS (SELECT 1 FROM public.push_subscriptions ps WHERE ps.player_id = p.id)
          AND NOT EXISTS (
            SELECT 1 FROM public.event_registrations er 
            WHERE er.event_id = v_event.id AND er.player_id = p.id AND er.status IN ('confirmed', 'waiting') AND er.is_guest = false
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.disciplinary_incidents di
            WHERE di.player_id = p.id AND di.group_id = v_event.group_id AND di.status = 'applied'
          )
      LOOP
        INSERT INTO public.notifications (player_id, title, body, type, metadata, idempotency_key)
        VALUES (
          v_player.id,
          'Lembrete de Inscrição',
          '[' || v_event.group_name || ']: sua inscrição será liberada em aproximadamente 1 minuto. Toque para acompanhar a lista.',
          'REGISTRATION_REMINDER',
          jsonb_build_object('event_id', v_event.id, 'group_id', v_event.group_id),
          'rem_pri_' || v_event.id || '_' || v_player.id
        ) ON CONFLICT (idempotency_key) DO NOTHING;
      END LOOP;
    END IF;

    -- 2. General Reminder (1 min before general opens, for non-priority players)
    IF v_event.priority_minutes > 0 AND v_now >= v_general_timestamp - interval '1 minute' AND v_now < v_general_timestamp THEN
      FOR v_player IN
        SELECT p.id, p.name
        FROM public.players p
        JOIN public.player_group_access pga ON pga.player_id = p.id
        JOIN public.player_push_preferences pref ON pref.player_id = p.id
        WHERE pga.group_id = v_event.group_id
          AND pga.status = 'approved'
          AND pref.notify_registration_open = true
          AND p.has_global_priority = false
          AND EXISTS (SELECT 1 FROM public.push_subscriptions ps WHERE ps.player_id = p.id)
          AND NOT EXISTS (
            SELECT 1 FROM public.event_registrations er 
            WHERE er.event_id = v_event.id AND er.player_id = p.id AND er.status IN ('confirmed', 'waiting') AND er.is_guest = false
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.disciplinary_incidents di
            WHERE di.player_id = p.id AND di.group_id = v_event.group_id AND di.status = 'applied'
          )
      LOOP
        INSERT INTO public.notifications (player_id, title, body, type, metadata, idempotency_key)
        VALUES (
          v_player.id,
          'Lembrete de Inscrição',
          '[' || v_event.group_name || ']: sua inscrição será liberada em aproximadamente 1 minuto. Toque para acompanhar a lista.',
          'REGISTRATION_REMINDER',
          jsonb_build_object('event_id', v_event.id, 'group_id', v_event.group_id),
          'rem_gen_' || v_event.id || '_' || v_player.id
        ) ON CONFLICT (idempotency_key) DO NOTHING;
      END LOOP;
    END IF;

    -- 3. Guest Release Reminder (1 min before guest release)
    IF v_guest_timestamp IS NOT NULL AND v_now >= v_guest_timestamp - interval '1 minute' AND v_now < v_guest_timestamp THEN
      FOR v_player IN
        SELECT p.id, p.name
        FROM public.players p
        JOIN public.player_group_access pga ON pga.player_id = p.id
        JOIN public.player_push_preferences pref ON pref.player_id = p.id
        WHERE pga.group_id = v_event.group_id
          AND pga.status = 'approved'
          AND pref.notify_guest_release = true
          AND EXISTS (SELECT 1 FROM public.push_subscriptions ps WHERE ps.player_id = p.id)
          AND EXISTS (
            SELECT 1 FROM public.event_registrations er 
            WHERE er.event_id = v_event.id AND er.player_id = p.id AND er.status IN ('confirmed', 'waiting') AND er.is_guest = false
          )
          AND (
            SELECT count(*) FROM public.event_registrations er 
            WHERE er.event_id = v_event.id AND er.registered_by_player_id = p.id AND er.is_guest = true AND er.status IN ('confirmed', 'waiting')
          ) < COALESCE(v_event.limite_convidados_por_usuario, 1)
          AND NOT EXISTS (
            SELECT 1 FROM public.disciplinary_incidents di
            WHERE di.player_id = p.id AND di.group_id = v_event.group_id AND di.status = 'applied'
          )
      LOOP
        INSERT INTO public.notifications (player_id, title, body, type, metadata, idempotency_key)
        VALUES (
          v_player.id,
          'Convidados liberados em 1 minuto',
          '[' || v_event.group_name || ']: a adição de convidados será liberada em aproximadamente 1 minuto.',
          'GUEST_REMINDER',
          jsonb_build_object('event_id', v_event.id, 'group_id', v_event.group_id),
          'rem_gst_' || v_event.id || '_' || v_player.id
        ) ON CONFLICT (idempotency_key) DO NOTHING;
      END LOOP;
    END IF;

  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Ensure the cron job is scheduled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('process_registration_reminders_cron');
    EXCEPTION WHEN OTHERS THEN
      -- Ignore if not found
    END;
    PERFORM cron.schedule('process_registration_reminders_cron', '* * * * *', 'SELECT public.process_registration_reminders();');
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping pg_cron schedule: %', SQLERRM;
END $$;
