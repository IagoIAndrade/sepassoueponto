ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS convidados_habilitados boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dia_liberacao_convidado integer NULL,
  ADD COLUMN IF NOT EXISTS hora_liberacao_convidado time without time zone NULL,
  ADD COLUMN IF NOT EXISTS limite_convidados_por_usuario integer NOT NULL DEFAULT 1;

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_dia_liberacao_convidado_check;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_dia_liberacao_convidado_check
  CHECK (dia_liberacao_convidado IS NULL OR (dia_liberacao_convidado >= 0 AND dia_liberacao_convidado <= 6));

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_limite_convidados_por_usuario_check;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_limite_convidados_por_usuario_check
  CHECK (limite_convidados_por_usuario >= 0 AND limite_convidados_por_usuario <= 10);

CREATE TABLE IF NOT EXISTS public.event_guests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.volleyball_events(id) ON DELETE CASCADE,
  nome_convidado text NOT NULL,
  usuario_responsavel_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz NULL,
  cancelled_by_player_id uuid NULL REFERENCES public.players(id) ON DELETE SET NULL,
  CONSTRAINT event_guests_nome_convidado_check CHECK (length(btrim(nome_convidado)) >= 2)
);

CREATE INDEX IF NOT EXISTS idx_event_guests_event_active ON public.event_guests(event_id, created_at, id) WHERE cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_event_guests_responsavel_active ON public.event_guests(event_id, usuario_responsavel_id) WHERE cancelled_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.event_guests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.event_guests TO service_role;

ALTER TABLE public.event_guests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_guests_public_read_active" ON public.event_guests;
CREATE POLICY "event_guests_public_read_active"
ON public.event_guests
FOR SELECT
TO anon, authenticated
USING (cancelled_at IS NULL);

DROP POLICY IF EXISTS "event_guests_service_all" ON public.event_guests;
CREATE POLICY "event_guests_service_all"
ON public.event_guests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

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
BEGIN
  v_player_id := public.internal_validate_session(p_token);
  IF v_player_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_name := btrim(COALESCE(p_nome_convidado, ''));
  IF length(v_name) < 2 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'invalid_guest_name';
  END IF;

  PERFORM public.lock_event(p_event_id);

  SELECT * INTO v_event
  FROM public.volleyball_events
  WHERE id = p_event_id
  FOR UPDATE;

  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;
  IF v_event.status <> 'open' THEN
    RAISE EXCEPTION 'event_not_open';
  END IF;
  IF NOT public.is_event_active(p_event_id) THEN
    RAISE EXCEPTION 'event_not_current';
  END IF;

  SELECT * INTO v_settings
  FROM public.app_settings
  WHERE group_id = v_event.group_id
  LIMIT 1;

  IF v_settings.id IS NULL THEN
    RAISE EXCEPTION 'settings_not_found';
  END IF;
  IF COALESCE(v_settings.convidados_habilitados, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'guests_disabled';
  END IF;

  v_limit := COALESCE(v_settings.limite_convidados_por_usuario, 1);
  IF v_limit <= 0 THEN
    RAISE EXCEPTION 'guest_limit_zero';
  END IF;

  IF v_settings.dia_liberacao_convidado IS NULL OR v_settings.hora_liberacao_convidado IS NULL THEN
    RAISE EXCEPTION 'guest_release_not_configured';
  END IF;

  v_delta := (extract(dow from v_event.event_date)::int - v_settings.dia_liberacao_convidado + 7) % 7;
  v_release_date := v_event.event_date - v_delta;
  v_release_at := (v_release_date::text || ' ' || v_settings.hora_liberacao_convidado::text)::timestamp
    AT TIME ZONE COALESCE(v_settings.timezone, 'America/Sao_Paulo');

  IF now() < v_release_at THEN
    RAISE EXCEPTION 'guest_release_not_reached';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.player_groups pg
    WHERE pg.player_id = v_player_id
      AND pg.group_id = v_event.group_id
      AND pg.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'group_access_required';
  END IF;

  SELECT count(*)::int INTO v_existing
  FROM public.event_guests eg
  WHERE eg.event_id = p_event_id
    AND eg.usuario_responsavel_id = v_player_id
    AND eg.cancelled_at IS NULL;

  IF v_existing >= v_limit THEN
    RAISE EXCEPTION 'guest_limit_reached';
  END IF;

  INSERT INTO public.event_guests(group_id, event_id, nome_convidado, usuario_responsavel_id)
  VALUES (v_event.group_id, p_event_id, v_name, v_player_id)
  RETURNING id, created_at INTO v_guest_id, v_created_at;

  out_guest_id := v_guest_id;
  out_created_at := v_created_at;
  RETURN NEXT;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.internal_add_event_guest(text, uuid, text) TO anon, authenticated, service_role;
