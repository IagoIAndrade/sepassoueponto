-- Desativar ABSOLUTAMENTE TODOS os triggers da tabela registrations.

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN (SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'registrations') LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.registrations', t.trigger_name);
    END LOOP;
END $$;
