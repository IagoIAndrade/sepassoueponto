
-- Normalizar dados da player_skills para escala 0-5
UPDATE public.player_skills
SET 
  attack_score = CASE WHEN attack_score > 5 THEN 5 ELSE attack_score END,
  defense_reception_score = CASE WHEN defense_reception_score > 5 THEN 5 ELSE defense_reception_score END,
  movement_score = CASE WHEN movement_score > 5 THEN 5 ELSE movement_score END,
  serve_score = CASE WHEN serve_score > 5 THEN 5 ELSE serve_score END,
  setting_score = CASE WHEN setting_score > 5 THEN 5 ELSE setting_score END;

-- Consertar restrições da player_skills (Admin) para escala 0-5
ALTER TABLE public.player_skills DROP CONSTRAINT IF EXISTS player_skills_attack_score_check;
ALTER TABLE public.player_skills DROP CONSTRAINT IF EXISTS player_skills_defense_reception_score_check;
ALTER TABLE public.player_skills DROP CONSTRAINT IF EXISTS player_skills_movement_score_check;
ALTER TABLE public.player_skills DROP CONSTRAINT IF EXISTS player_skills_serve_score_check;
ALTER TABLE public.player_skills DROP CONSTRAINT IF EXISTS player_skills_setting_score_check;

ALTER TABLE public.player_skills ADD CONSTRAINT player_skills_attack_score_check CHECK (attack_score >= 0 AND attack_score <= 5);
ALTER TABLE public.player_skills ADD CONSTRAINT player_skills_defense_reception_score_check CHECK (defense_reception_score >= 0 AND defense_reception_score <= 5);
ALTER TABLE public.player_skills ADD CONSTRAINT player_skills_movement_score_check CHECK (movement_score >= 0 AND movement_score <= 5);
ALTER TABLE public.player_skills ADD CONSTRAINT player_skills_serve_score_check CHECK (serve_score >= 0 AND serve_score <= 5);
ALTER TABLE public.player_skills ADD CONSTRAINT player_skills_setting_score_check CHECK (setting_score >= 0 AND setting_score <= 5);

-- Garantir GRANTs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_self_ratings TO authenticated;
GRANT ALL ON public.player_self_ratings TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_skills TO authenticated;
GRANT ALL ON public.player_skills TO service_role;
