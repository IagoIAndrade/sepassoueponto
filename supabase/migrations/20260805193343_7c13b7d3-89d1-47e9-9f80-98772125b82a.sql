-- Adicionar campos de avatar na tabela players
ALTER TABLE public.players 
ADD COLUMN IF NOT EXISTS avatar_path text,
ADD COLUMN IF NOT EXISTS avatar_status text DEFAULT 'none' CHECK (avatar_status IN ('none', 'pending', 'approved', 'rejected')),
ADD COLUMN IF NOT EXISTS avatar_uploaded_at timestamptz,
ADD COLUMN IF NOT EXISTS avatar_updated_at timestamptz,
ADD COLUMN IF NOT EXISTS avatar_rejection_reason text;

-- Função para verificar se a foto é necessária
CREATE OR REPLACE FUNCTION public.player_needs_photo(p_player_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT 
    CASE 
      WHEN avatar_path IS NULL OR avatar_status = 'rejected' THEN true
      ELSE false
    END
  FROM public.players 
  WHERE id = p_player_id;
$$;
