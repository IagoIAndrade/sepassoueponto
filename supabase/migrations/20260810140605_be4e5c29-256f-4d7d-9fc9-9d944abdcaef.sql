-- Final reconciliation migration
-- Add missing columns to player_skills if they don't exist
ALTER TABLE public.player_skills 
ADD COLUMN IF NOT EXISTS reception_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS block_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS defense_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS movement_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS positioning_score INTEGER DEFAULT 0;

-- Migrate data from legacy columns if they exist
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'player_skills' AND column_name = 'defense_reception_score') THEN
    UPDATE public.player_skills SET reception_score = defense_reception_score, defense_score = defense_reception_score WHERE reception_score = 0;
  END IF;
END $$;

-- Normalize to 0-5 scale
UPDATE public.player_skills SET 
  reception_score = LEAST(5, reception_score),
  setting_score = LEAST(5, setting_score),
  attack_score = LEAST(5, attack_score),
  serve_score = LEAST(5, serve_score),
  block_score = LEAST(5, block_score),
  defense_score = LEAST(5, defense_score),
  movement_score = LEAST(5, movement_score),
  positioning_score = LEAST(5, positioning_score);

UPDATE public.player_self_ratings SET 
  reception_score = LEAST(5, reception_score),
  setting_score = LEAST(5, setting_score),
  attack_score = LEAST(5, attack_score),
  serve_score = LEAST(5, serve_score),
  block_score = LEAST(5, block_score),
  defense_score = LEAST(5, defense_score),
  movement_score = LEAST(5, movement_score),
  positioning_score = LEAST(5, positioning_score);

-- Constraints
ALTER TABLE public.player_skills DROP CONSTRAINT IF EXISTS player_skills_scores_range;
ALTER TABLE public.player_skills ADD CONSTRAINT player_skills_scores_range 
CHECK (
    (reception_score IS NULL OR (reception_score >= 0 AND reception_score <= 5)) AND
    (setting_score IS NULL OR (setting_score >= 0 AND setting_score <= 5)) AND
    (attack_score IS NULL OR (attack_score >= 0 AND attack_score <= 5)) AND
    (serve_score IS NULL OR (serve_score >= 0 AND serve_score <= 5)) AND
    (block_score IS NULL OR (block_score >= 0 AND block_score <= 5)) AND
    (defense_score IS NULL OR (defense_score >= 0 AND defense_score <= 5)) AND
    (movement_score IS NULL OR (movement_score >= 0 AND movement_score <= 5)) AND
    (positioning_score IS NULL OR (positioning_score >= 0 AND positioning_score <= 5))
);

ALTER TABLE public.player_self_ratings DROP CONSTRAINT IF EXISTS player_self_ratings_scores_range;
ALTER TABLE public.player_self_ratings ADD CONSTRAINT player_self_ratings_scores_range 
CHECK (
    (reception_score IS NULL OR (reception_score >= 0 AND reception_score <= 5)) AND
    (setting_score IS NULL OR (setting_score >= 0 AND setting_score <= 5)) AND
    (attack_score IS NULL OR (attack_score >= 0 AND attack_score <= 5)) AND
    (serve_score IS NULL OR (serve_score >= 0 AND serve_score <= 5)) AND
    (block_score IS NULL OR (block_score >= 0 AND block_score <= 5)) AND
    (defense_score IS NULL OR (defense_score >= 0 AND defense_score <= 5)) AND
    (movement_score IS NULL OR (movement_score >= 0 AND movement_score <= 5)) AND
    (positioning_score IS NULL OR (positioning_score >= 0 AND positioning_score <= 5))
);
