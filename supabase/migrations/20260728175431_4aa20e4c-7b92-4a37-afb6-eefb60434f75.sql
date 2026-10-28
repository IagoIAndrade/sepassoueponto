CREATE TABLE public.player_skills (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid NOT NULL UNIQUE REFERENCES public.players(id) ON DELETE CASCADE,
  setting_score smallint CHECK (setting_score BETWEEN 1 AND 10),
  attack_score smallint CHECK (attack_score BETWEEN 1 AND 10),
  defense_reception_score smallint CHECK (defense_reception_score BETWEEN 1 AND 10),
  serve_score smallint CHECK (serve_score BETWEEN 1 AND 10),
  movement_score smallint CHECK (movement_score BETWEEN 1 AND 10),
  primary_position text NOT NULL DEFAULT 'undefined'
    CHECK (primary_position IN ('setter','outside','middle','opposite','libero','undefined')),
  height_cm smallint CHECK (height_cm BETWEEN 120 AND 250),
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_skills TO authenticated;
GRANT ALL ON public.player_skills TO service_role;

ALTER TABLE public.player_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage player skills"
ON public.player_skills FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER player_skills_set_updated_at
BEFORE UPDATE ON public.player_skills
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.skill_weights (
  id boolean NOT NULL DEFAULT true PRIMARY KEY CHECK (id),
  setting_weight smallint NOT NULL DEFAULT 20 CHECK (setting_weight BETWEEN 0 AND 100),
  attack_weight smallint NOT NULL DEFAULT 25 CHECK (attack_weight BETWEEN 0 AND 100),
  defense_reception_weight smallint NOT NULL DEFAULT 25 CHECK (defense_reception_weight BETWEEN 0 AND 100),
  serve_weight smallint NOT NULL DEFAULT 15 CHECK (serve_weight BETWEEN 0 AND 100),
  movement_weight smallint NOT NULL DEFAULT 15 CHECK (movement_weight BETWEEN 0 AND 100),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT skill_weights_sum_100 CHECK (
    setting_weight + attack_weight + defense_reception_weight + serve_weight + movement_weight = 100
  )
);

GRANT SELECT, INSERT, UPDATE ON public.skill_weights TO authenticated;
GRANT ALL ON public.skill_weights TO service_role;

ALTER TABLE public.skill_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins manage skill weights"
ON public.skill_weights FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER skill_weights_set_updated_at
BEFORE UPDATE ON public.skill_weights
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.skill_weights (id) VALUES (true) ON CONFLICT (id) DO NOTHING;