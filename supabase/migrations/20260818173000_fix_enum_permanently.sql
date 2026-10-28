-- Adicionar 'waiting' ao enum se ele não existir, para parar o erro.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'waiting' AND enumtypid = 'public.list_type'::regtype) THEN
        ALTER TYPE public.list_type ADD VALUE 'waiting';
    END IF;
END $$;
