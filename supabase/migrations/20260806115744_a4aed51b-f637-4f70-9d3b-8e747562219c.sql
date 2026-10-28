-- Prepare migration
CREATE TABLE IF NOT EXISTS public.player_skills (
    player_id UUID PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
    setting_score NUMERIC,
    attack_score NUMERIC,
    defense_reception_score NUMERIC,
    serve_score NUMERIC,
    movement_score NUMERIC,
    primary_position TEXT,
    height_cm NUMERIC,
    notes TEXT,
    updated_at TIMESTAMPTZ DEFAULT now(),
    updated_by UUID
);

ALTER TABLE public.player_groups ADD COLUMN IF NOT EXISTS is_organizer BOOLEAN DEFAULT false;
ALTER TABLE public.player_groups ADD COLUMN IF NOT EXISTS organizer_order INTEGER DEFAULT 0;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_skills TO authenticated;
GRANT ALL ON public.player_skills TO service_role;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Admins can manage all skills') THEN
        ALTER TABLE public.player_skills ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "Admins can manage all skills" ON public.player_skills
        FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Players can view all skills') THEN
        CREATE POLICY "Players can view all skills" ON public.player_skills
        FOR SELECT TO authenticated USING (true);
    END IF;
END $$;
