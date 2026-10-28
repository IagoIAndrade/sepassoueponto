-- =========================================================
-- 1. TURMAS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.groups TO service_role;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_groups_updated_at ON public.groups;
CREATE TRIGGER trg_groups_updated_at BEFORE UPDATE ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.groups (slug, name, active, sort_order) VALUES
  ('terca',  'Terça-feira',  true, 1),
  ('quarta', 'Quarta-feira', true, 2),
  ('quinta', 'Quinta-feira', true, 3)
ON CONFLICT (slug) DO NOTHING;

-- =========================================================
-- 2. JOGADOR x TURMA
-- =========================================================
CREATE TABLE IF NOT EXISTS public.player_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (player_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_player_groups_group ON public.player_groups(group_id);
GRANT ALL ON public.player_groups TO service_role;
ALTER TABLE public.player_groups ENABLE ROW LEVEL SECURITY;

INSERT INTO public.player_groups (player_id, group_id)
SELECT p.id, g.id FROM public.players p CROSS JOIN public.groups g
WHERE g.slug = 'quarta'
ON CONFLICT DO NOTHING;

-- =========================================================
-- 3. CONFIGURAÇÕES POR TURMA
-- =========================================================
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE;

-- linha mais antiga (a efetivamente usada hoje) = quarta
UPDATE public.app_settings s SET group_id = (SELECT id FROM public.groups WHERE slug='quarta')
WHERE s.id = (SELECT id FROM public.app_settings ORDER BY created_at ASC, id ASC LIMIT 1);

-- linha remanescente (duplicata histórica) reaproveitada como terça
UPDATE public.app_settings s
SET group_id = (SELECT id FROM public.groups WHERE slug='terca'),
    event_weekday = 2
WHERE s.group_id IS NULL
  AND s.id = (SELECT id FROM public.app_settings WHERE group_id IS NULL ORDER BY created_at ASC, id ASC LIMIT 1);

-- quinta: clona a configuração da quarta, mudando apenas o dia do jogo
INSERT INTO public.app_settings
  (group_id, location, start_time, end_time, main_limit, event_weekday, open_weekday, open_time, timezone,
   event_name, withdrawal_deadline_weekday, withdrawal_deadline_time, penalty_late_leave, penalty_no_show,
   show_rules_to_players, priority_minutes)
SELECT (SELECT id FROM public.groups WHERE slug='quinta'),
       s.location, s.start_time, s.end_time, s.main_limit, 4, s.open_weekday, s.open_time, s.timezone,
       s.event_name, s.withdrawal_deadline_weekday, s.withdrawal_deadline_time, s.penalty_late_leave,
       s.penalty_no_show, s.show_rules_to_players, s.priority_minutes
FROM public.app_settings s
WHERE s.group_id = (SELECT id FROM public.groups WHERE slug='quarta')
  AND NOT EXISTS (SELECT 1 FROM public.app_settings x WHERE x.group_id = (SELECT id FROM public.groups WHERE slug='quinta'));

-- caso a duplicata histórica não existisse, garante a linha de terça
INSERT INTO public.app_settings
  (group_id, location, start_time, end_time, main_limit, event_weekday, open_weekday, open_time, timezone,
   event_name, withdrawal_deadline_weekday, withdrawal_deadline_time, penalty_late_leave, penalty_no_show,
   show_rules_to_players, priority_minutes)
SELECT (SELECT id FROM public.groups WHERE slug='terca'),
       s.location, s.start_time, s.end_time, s.main_limit, 2, s.open_weekday, s.open_time, s.timezone,
       s.event_name, s.withdrawal_deadline_weekday, s.withdrawal_deadline_time, s.penalty_late_leave,
       s.penalty_no_show, s.show_rules_to_players, s.priority_minutes
FROM public.app_settings s
WHERE s.group_id = (SELECT id FROM public.groups WHERE slug='quarta')
  AND NOT EXISTS (SELECT 1 FROM public.app_settings x WHERE x.group_id = (SELECT id FROM public.groups WHERE slug='terca'));

ALTER TABLE public.app_settings ALTER COLUMN group_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_app_settings_group ON public.app_settings(group_id);

-- =========================================================
-- 4. RODADAS POR TURMA
-- =========================================================
ALTER TABLE public.volleyball_events ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id) ON DELETE RESTRICT;
UPDATE public.volleyball_events SET group_id = (SELECT id FROM public.groups WHERE slug='quarta') WHERE group_id IS NULL;
ALTER TABLE public.volleyball_events ALTER COLUMN group_id SET NOT NULL;
ALTER TABLE public.volleyball_events DROP CONSTRAINT IF EXISTS volleyball_events_event_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS uq_volleyball_events_group_date ON public.volleyball_events(group_id, event_date);
CREATE INDEX IF NOT EXISTS idx_volleyball_events_group_status ON public.volleyball_events(group_id, status, event_date);

-- =========================================================
-- 5. OCORRÊNCIAS E BLOQUEIOS POR TURMA (com abrangência)
-- =========================================================
ALTER TABLE public.player_incidents ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id) ON DELETE RESTRICT;
ALTER TABLE public.player_incidents ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'group';
ALTER TABLE public.player_incidents DROP CONSTRAINT IF EXISTS player_incidents_scope_check;
ALTER TABLE public.player_incidents ADD CONSTRAINT player_incidents_scope_check CHECK (scope IN ('group','global'));
UPDATE public.player_incidents i
SET group_id = e.group_id
FROM public.volleyball_events e
WHERE e.id = i.event_id AND i.group_id IS NULL;
UPDATE public.player_incidents SET group_id = (SELECT id FROM public.groups WHERE slug='quarta') WHERE group_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_player_incidents_group ON public.player_incidents(group_id);

ALTER TABLE public.player_blocks ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id) ON DELETE RESTRICT;
ALTER TABLE public.player_blocks ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'group';
ALTER TABLE public.player_blocks DROP CONSTRAINT IF EXISTS player_blocks_scope_check;
ALTER TABLE public.player_blocks ADD CONSTRAINT player_blocks_scope_check CHECK (scope IN ('group','global'));
UPDATE public.player_blocks SET group_id = (SELECT id FROM public.groups WHERE slug='quarta') WHERE group_id IS NULL AND scope = 'group';
CREATE INDEX IF NOT EXISTS idx_player_blocks_group ON public.player_blocks(group_id);

-- =========================================================
-- 6. RATEIOS: GLOBAL OU POR TURMA
-- =========================================================
ALTER TABLE public.equipment_funds ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'global';
ALTER TABLE public.equipment_funds DROP CONSTRAINT IF EXISTS equipment_funds_scope_check;
ALTER TABLE public.equipment_funds ADD CONSTRAINT equipment_funds_scope_check CHECK (scope IN ('global','group'));
ALTER TABLE public.equipment_funds ADD COLUMN IF NOT EXISTS description text;

CREATE TABLE IF NOT EXISTS public.fund_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id uuid NOT NULL REFERENCES public.equipment_funds(id) ON DELETE CASCADE,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fund_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_fund_groups_group ON public.fund_groups(group_id);
GRANT ALL ON public.fund_groups TO service_role;
ALTER TABLE public.fund_groups ENABLE ROW LEVEL SECURITY;

-- rateio atual permanece único e passa a valer para todas as turmas
UPDATE public.equipment_funds SET scope = 'global';