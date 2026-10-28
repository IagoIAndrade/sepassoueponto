-- Adiciona a nova coluna de minutos de prioridade se não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'app_settings' AND column_name = 'priority_minutes') THEN
        ALTER TABLE public.app_settings ADD COLUMN priority_minutes integer NOT NULL DEFAULT 30;
    END IF;
END $$;

-- Garante que o GRANT de SELECT continue funcionando para authenticated (embora já deva existir)
GRANT SELECT, UPDATE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;

-- Comentário para documentar o campo
COMMENT ON COLUMN public.app_settings.priority_minutes IS 'Duração em minutos da prioridade para jogadores "Em Dia" após a abertura da lista.';
