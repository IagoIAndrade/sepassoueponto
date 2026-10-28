-- =========================================================================
-- LOTE 1 - Migração 1: Fundação (enums, tabelas, constraints, índices, RLS)
-- =========================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------- ENUMS ----------
CREATE TYPE public.app_role     AS ENUM ('admin','moderator','user');
CREATE TYPE public.event_status AS ENUM ('scheduled','open','closed','completed','cancelled');
CREATE TYPE public.list_type    AS ENUM ('main','wait');

-- ---------- Trigger util ----------
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ---------- app_settings (singleton) ----------
CREATE TABLE public.app_settings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location        text NOT NULL DEFAULT 'Ginásio',
  start_time      time NOT NULL DEFAULT '20:00',
  end_time        time NOT NULL DEFAULT '22:00',
  main_limit      int  NOT NULL DEFAULT 18 CHECK (main_limit > 0),
  event_weekday   int  NOT NULL DEFAULT 4 CHECK (event_weekday BETWEEN 0 AND 6), -- 4 = quinta (ISO 0=dom)
  open_weekday    int  NOT NULL DEFAULT 5 CHECK (open_weekday  BETWEEN 0 AND 6), -- 5 = sexta
  open_time       time NOT NULL DEFAULT '12:00',
  timezone        text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_app_settings_updated BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- players ----------
CREATE TABLE public.players (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL CHECK (length(btrim(name)) > 0),
  name_normalized   text GENERATED ALWAYS AS (lower(btrim(name))) STORED,
  phone             text NOT NULL,
  phone_normalized  text NOT NULL,
  pin_hash          text NOT NULL,
  must_change_pin   boolean NOT NULL DEFAULT false,
  active            boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (phone_normalized)
);
CREATE INDEX idx_players_name_norm ON public.players (name_normalized);
GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_players_updated BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- player_sessions ----------
CREATE TABLE public.player_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  token_hash    text NOT NULL UNIQUE,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  ip            inet,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_player_sessions_player ON public.player_sessions (player_id);
CREATE INDEX idx_player_sessions_active ON public.player_sessions (expires_at) WHERE revoked_at IS NULL;
GRANT ALL ON public.player_sessions TO service_role;
ALTER TABLE public.player_sessions ENABLE ROW LEVEL SECURITY;

-- ---------- player_login_attempts ----------
CREATE TABLE public.player_login_attempts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_normalized  text,
  ip                inet,
  success           boolean NOT NULL,
  attempted_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_attempts_phone ON public.player_login_attempts (phone_normalized, attempted_at DESC);
CREATE INDEX idx_login_attempts_ip    ON public.player_login_attempts (ip, attempted_at DESC);
GRANT ALL ON public.player_login_attempts TO service_role;
ALTER TABLE public.player_login_attempts ENABLE ROW LEVEL SECURITY;

-- ---------- player_search_hits ----------
CREATE TABLE public.player_search_hits (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES public.player_sessions(id) ON DELETE CASCADE,
  hit_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_search_hits_session ON public.player_search_hits (session_id, hit_at DESC);
GRANT ALL ON public.player_search_hits TO service_role;
ALTER TABLE public.player_search_hits ENABLE ROW LEVEL SECURITY;

-- ---------- volleyball_events ----------
CREATE TABLE public.volleyball_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_date        date NOT NULL UNIQUE,
  opens_at          timestamptz NOT NULL,
  closes_at         timestamptz,
  status            public.event_status NOT NULL DEFAULT 'scheduled',
  manual_override   boolean NOT NULL DEFAULT false,
  -- snapshot das configurações da rodada
  location          text NOT NULL,
  start_time        time NOT NULL,
  end_time          time NOT NULL,
  main_limit        int  NOT NULL CHECK (main_limit > 0),
  timezone          text NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_status ON public.volleyball_events (status, event_date DESC);
GRANT ALL ON public.volleyball_events TO service_role;
ALTER TABLE public.volleyball_events ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_events_updated BEFORE UPDATE ON public.volleyball_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ---------- registrations ----------
CREATE TABLE public.registrations (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id                  uuid NOT NULL REFERENCES public.volleyball_events(id) ON DELETE CASCADE,
  player_id                 uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  registered_by_player_id   uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  list_type                 public.list_type NOT NULL,
  position_number           int NOT NULL CHECK (position_number >= 1),
  created_at                timestamptz NOT NULL DEFAULT now(),
  cancelled_at              timestamptz,
  cancelled_by_player_id    uuid REFERENCES public.players(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX uq_reg_player_active
  ON public.registrations (event_id, player_id)
  WHERE cancelled_at IS NULL;
CREATE UNIQUE INDEX uq_reg_position_active
  ON public.registrations (event_id, list_type, position_number)
  WHERE cancelled_at IS NULL;
CREATE INDEX idx_reg_event_active ON public.registrations (event_id, list_type, position_number) WHERE cancelled_at IS NULL;
CREATE INDEX idx_reg_registered_by ON public.registrations (registered_by_player_id) WHERE cancelled_at IS NULL;
CREATE INDEX idx_reg_player ON public.registrations (player_id);
GRANT ALL ON public.registrations TO service_role;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- ---------- player_blocks ----------
CREATE TABLE public.player_blocks (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id                 uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  starts_at                 date NOT NULL,
  ends_at                   date NOT NULL,
  reason                    text,
  admin_notes               text,
  active                    boolean NOT NULL DEFAULT true,
  created_by_admin_user_id  uuid,
  ended_early_at            timestamptz,
  ended_by_admin_user_id    uuid,
  created_at                timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at)
);
CREATE INDEX idx_blocks_player_active ON public.player_blocks (player_id, active) WHERE active = true;
CREATE INDEX idx_blocks_range ON public.player_blocks (player_id, starts_at, ends_at) WHERE active = true;
GRANT ALL ON public.player_blocks TO service_role;
ALTER TABLE public.player_blocks ENABLE ROW LEVEL SECURITY;

-- ---------- teams ----------
CREATE TABLE public.teams (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid NOT NULL REFERENCES public.volleyball_events(id) ON DELETE CASCADE,
  team_number  smallint NOT NULL CHECK (team_number IN (1,2,3)),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, team_number)
);
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

-- ---------- team_members ----------
CREATE TABLE public.team_members (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  registration_id  uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (registration_id)
);
CREATE INDEX idx_team_members_team ON public.team_members (team_id);
GRANT ALL ON public.team_members TO service_role;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- ---------- admin_actions_log ----------
CREATE TABLE public.admin_actions_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id  uuid,
  action         text NOT NULL,
  target_type    text,
  target_id      uuid,
  details        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_log_created ON public.admin_actions_log (created_at DESC);
GRANT ALL ON public.admin_actions_log TO service_role;
ALTER TABLE public.admin_actions_log ENABLE ROW LEVEL SECURITY;

-- ---------- user_roles + has_role ----------
CREATE TABLE public.user_roles (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role     public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL    ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user can read own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

-- ---------- seed app_settings ----------
INSERT INTO public.app_settings (location, start_time, end_time, main_limit)
VALUES ('Ginásio', '20:00', '22:00', 18);
