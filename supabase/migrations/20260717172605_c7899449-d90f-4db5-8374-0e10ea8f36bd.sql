
-- ==========================================================
-- LOTE B: player_incidents + event_attendance (estrutura)
-- ==========================================================

-- 1) player_incidents
CREATE TABLE public.player_incidents (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.volleyball_events(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  incident_type text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  suggested_rounds integer NOT NULL,
  applied_rounds integer,
  status text NOT NULL DEFAULT 'pending',
  justification text,
  admin_notes text,
  decided_by_admin_user_id uuid,
  decided_at timestamptz,
  block_id uuid REFERENCES public.player_blocks(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT player_incidents_type_check
    CHECK (incident_type IN ('late_leave','no_show')),
  CONSTRAINT player_incidents_status_check
    CHECK (status IN ('pending','applied','justified','cancelled','completed')),
  CONSTRAINT player_incidents_suggested_rounds_check
    CHECK (suggested_rounds >= 0),
  CONSTRAINT player_incidents_applied_rounds_check
    CHECK (applied_rounds IS NULL OR applied_rounds >= 0),
  CONSTRAINT player_incidents_unique_event_player_type
    UNIQUE (event_id, player_id, incident_type)
);

-- Unicidade parcial de block_id (não NULL): uma ocorrência por bloqueio
CREATE UNIQUE INDEX player_incidents_block_id_unique
  ON public.player_incidents (block_id)
  WHERE block_id IS NOT NULL;

-- Índices de consulta
CREATE INDEX idx_player_incidents_event ON public.player_incidents (event_id);
CREATE INDEX idx_player_incidents_player ON public.player_incidents (player_id);
CREATE INDEX idx_player_incidents_status ON public.player_incidents (status);
CREATE INDEX idx_player_incidents_status_occurred
  ON public.player_incidents (status, occurred_at DESC);

-- GRANTS: acesso somente via service_role. Revogar anon/authenticated.
REVOKE ALL ON public.player_incidents FROM PUBLIC;
REVOKE ALL ON public.player_incidents FROM anon;
REVOKE ALL ON public.player_incidents FROM authenticated;
GRANT ALL ON public.player_incidents TO service_role;

-- RLS habilitada sem policies (nega tudo por padrão para anon/authenticated)
ALTER TABLE public.player_incidents ENABLE ROW LEVEL SECURITY;


-- 2) event_attendance
CREATE TABLE public.event_attendance (
  event_id uuid NOT NULL REFERENCES public.volleyball_events(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'unknown',
  notes text,
  recorded_by_admin_user_id uuid,
  recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, player_id),
  CONSTRAINT event_attendance_status_check
    CHECK (status IN ('unknown','present','absent_justified','absent_unjustified'))
);

CREATE INDEX idx_event_attendance_player ON public.event_attendance (player_id);
CREATE INDEX idx_event_attendance_status ON public.event_attendance (status);

REVOKE ALL ON public.event_attendance FROM PUBLIC;
REVOKE ALL ON public.event_attendance FROM anon;
REVOKE ALL ON public.event_attendance FROM authenticated;
GRANT ALL ON public.event_attendance TO service_role;

ALTER TABLE public.event_attendance ENABLE ROW LEVEL SECURITY;
