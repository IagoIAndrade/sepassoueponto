-- LOTE 1.1-A: Correções de imutabilidade e search_path

-- 1) normalize_phone: adicionar search_path explícito (segurança do linter)
CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_temp
AS $$
  SELECT regexp_replace(coalesce(p,''), '[^0-9]', '', 'g');
$$;

-- 2) tg_set_updated_at: adicionar pg_temp ao search_path
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;