-- Desabilitar triggers da tabela registrations para identificar qual deles está causando o erro.

-- 1. Identificar triggers
DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN (SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'registrations') LOOP
        EXECUTE format('ALTER TABLE public.registrations DISABLE TRIGGER %I', t.trigger_name);
    END LOOP;
END $$;
