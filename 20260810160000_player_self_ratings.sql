-- 1. Criar a tabela de autoavaliação
CREATE TABLE public.player_self_ratings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id uuid REFERENCES public.players(id) ON DELETE CASCADE NOT NULL,
    reception_score int4 CHECK (reception_score >= 0 AND reception_score <= 5),
    setting_score int4 CHECK (setting_score >= 0 AND setting_score <= 5),
    attack_score int4 CHECK (attack_score >= 0 AND attack_score <= 5),
    serve_score int4 CHECK (serve_score >= 0 AND serve_score <= 5),
    block_score int4 CHECK (block_score >= 0 AND block_score <= 5),
    defense_score int4 CHECK (defense_score >= 0 AND defense_score <= 5),
    movement_score int4 CHECK (movement_score >= 0 AND movement_score <= 5),
    positioning_score int4 CHECK (positioning_score >= 0 AND positioning_score <= 5),
    primary_position text,
    height_cm int4,
    overall_level float8,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL
);

-- 2. Grants
GRANT SELECT, INSERT, UPDATE ON public.player_self_ratings TO authenticated;
GRANT ALL ON public.player_self_ratings TO service_role;

-- 3. RLS
ALTER TABLE public.player_self_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own self-ratings"
ON public.player_self_ratings
FOR ALL
TO authenticated
USING (player_id = auth.uid())
WITH CHECK (player_id = auth.uid());

CREATE POLICY "Admins can view all self-ratings"
ON public.player_self_ratings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4. Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_player_self_ratings_updated_at
  BEFORE UPDATE ON public.player_self_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- 5. RPC para buscar autoavaliação (idempotência e segurança)
CREATE OR REPLACE FUNCTION public.get_my_self_rating()
RETURNS SETOF public.player_self_ratings
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT * FROM public.player_self_ratings WHERE player_id = auth.uid() ORDER BY created_at DESC LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_self_rating() TO authenticated;

-- 6. Garantir que admins tenham grant na player_skills (caso falte)
GRANT SELECT, INSERT, UPDATE ON public.player_skills TO authenticated;
