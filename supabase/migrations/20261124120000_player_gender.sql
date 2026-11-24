-- Gênero do jogador (F = feminino, M = masculino). Jogadores já cadastrados ficam NULL
-- (não informado) até o admin definir. Usado para equilibrar a quantidade de mulheres por time.
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS gender text;
ALTER TABLE public.players DROP CONSTRAINT IF EXISTS players_gender_check;
ALTER TABLE public.players ADD CONSTRAINT players_gender_check CHECK (gender IS NULL OR gender IN ('F', 'M'));
