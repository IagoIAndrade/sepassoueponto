-- Criar a função pública para resgatar status disciplinar consolidado
CREATE OR REPLACE FUNCTION public.get_player_disciplinary_status(p_player_id uuid, p_group_id uuid, p_event_id uuid)
RETURNS TABLE (is_blocked boolean, rounds_remaining integer)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_event record;
    v_incident record;
    v_rounds_passed integer;
    v_rounds_remaining integer;
    v_total_remaining integer := 0;
    v_blocks_count integer;
BEGIN
    SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id;
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, 0;
        RETURN;
    END IF;

    FOR v_incident IN
        SELECT * FROM public.player_incidents
        WHERE player_id = p_player_id
          AND group_id = p_group_id
          AND status IN ('active', 'ACTIVE', 'applied', 'APPLIED')
    LOOP
        SELECT COUNT(*)
        INTO v_rounds_passed
        FROM public.volleyball_events
        WHERE group_id = p_group_id
          AND event_date > v_incident.occurred_at::date
          AND event_date <= v_event.event_date
          AND status NOT IN ('cancelled');

        v_rounds_remaining := COALESCE(v_incident.applied_rounds, v_incident.suggested_rounds, 0) - v_rounds_passed;
        IF v_rounds_remaining > 0 THEN
            v_total_remaining := v_total_remaining + v_rounds_remaining;
        END IF;
    END LOOP;

    SELECT COUNT(DISTINCT e.id)
    INTO v_blocks_count
    FROM public.player_blocks b
    JOIN public.volleyball_events e 
      ON e.event_date >= v_event.event_date 
      AND e.event_date BETWEEN b.starts_at AND b.ends_at
      AND (b.scope = 'global' OR e.group_id = b.group_id)
    WHERE b.player_id = p_player_id
      AND b.active = true
      AND (b.scope = 'global' OR b.group_id = p_group_id)
      AND e.status NOT IN ('cancelled');
      
    IF v_blocks_count > v_total_remaining THEN
        v_total_remaining := v_blocks_count;
    END IF;

    IF v_total_remaining > 0 THEN
        RETURN QUERY SELECT true, v_total_remaining;
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.player_blocks b
        WHERE b.player_id = p_player_id
          AND b.active = true
          AND v_event.event_date BETWEEN b.starts_at AND b.ends_at
          AND (b.scope = 'global' OR b.group_id = p_group_id)
    ) THEN
        RETURN QUERY SELECT true, 1;
        RETURN;
    END IF;

    RETURN QUERY SELECT false, 0;
END;
$$;

-- Injetar verificação no add_guest
CREATE OR REPLACE FUNCTION public.internal_add_event_guest(
  p_token text,
  p_event_id uuid,
  p_nome_convidado text
)
RETURNS TABLE(out_guest_id uuid, out_created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_player_id uuid;
  v_event public.volleyball_events;
  v_settings public.app_settings;
  v_name text;
  v_limit int;
  v_existing int;
  v_release_at timestamptz;
  v_release_date date;
  v_delta int;
  v_guest_id uuid;
  v_created_at timestamptz;
  v_is_blocked boolean;
BEGIN
  v_player_id := public.internal_validate_session(p_token);
  IF v_player_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  v_name := btrim(COALESCE(p_nome_convidado, ''));
  IF length(v_name) < 2 OR length(v_name) > 120 THEN RAISE EXCEPTION 'invalid_guest_name'; END IF;

  PERFORM public.lock_event(p_event_id);

  SELECT * INTO v_event FROM public.volleyball_events WHERE id = p_event_id FOR UPDATE;
  IF v_event.id IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;
  IF v_event.status <> 'open' THEN RAISE EXCEPTION 'event_not_open'; END IF;
  IF NOT public.is_event_active(p_event_id) THEN RAISE EXCEPTION 'event_not_current'; END IF;

  SELECT is_blocked INTO v_is_blocked FROM public.get_player_disciplinary_status(v_player_id, v_event.group_id, p_event_id);
  IF v_is_blocked THEN RAISE EXCEPTION 'Você está bloqueado nesta turma e não pode adicionar convidados.'; END IF;

  SELECT * INTO v_settings FROM public.app_settings WHERE group_id = v_event.group_id LIMIT 1;
  IF v_settings.id IS NULL THEN RAISE EXCEPTION 'settings_not_found'; END IF;
  IF COALESCE(v_settings.convidados_habilitados, false) IS NOT TRUE THEN RAISE EXCEPTION 'guests_disabled'; END IF;

  v_limit := COALESCE(v_settings.limite_convidados_por_usuario, 1);
  IF v_limit <= 0 THEN RAISE EXCEPTION 'guest_limit_zero'; END IF;

  IF v_settings.dia_liberacao_convidado IS NULL OR v_settings.hora_liberacao_convidado IS NULL THEN
    RAISE EXCEPTION 'guest_release_not_configured';
  END IF;

  v_delta := (extract(dow from v_event.event_date)::int - v_settings.dia_liberacao_convidado + 7) % 7;
  v_release_date := v_event.event_date - v_delta;
  v_release_at := (v_release_date::text || ' ' || v_settings.hora_liberacao_convidado::text)::timestamp
    AT TIME ZONE COALESCE(v_settings.timezone, 'America/Sao_Paulo');

  IF now() < v_release_at THEN RAISE EXCEPTION 'guest_release_not_reached'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.player_groups pg
    WHERE pg.player_id = v_player_id AND pg.group_id = v_event.group_id AND pg.status = 'approved'
  ) THEN RAISE EXCEPTION 'group_access_required'; END IF;

  SELECT count(*)::int INTO v_existing FROM public.event_guests eg
  WHERE eg.event_id = p_event_id AND eg.usuario_responsavel_id = v_player_id AND eg.cancelled_at IS NULL;

  IF v_existing >= v_limit THEN RAISE EXCEPTION 'guest_limit_reached'; END IF;

  INSERT INTO public.event_guests(group_id, event_id, nome_convidado, usuario_responsavel_id)
  VALUES (v_event.group_id, p_event_id, v_name, v_player_id)
  RETURNING id, created_at INTO v_guest_id, v_created_at;

  out_guest_id := v_guest_id;
  out_created_at := v_created_at;
  RETURN NEXT;
END;
$function$;
