-- Resetar valores default da coluna list_type e re-habilitar triggers.

ALTER TABLE public.registrations ALTER COLUMN list_type SET DEFAULT 'wait'::public.list_type;

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN (SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'registrations') LOOP
        EXECUTE format('ALTER TABLE public.registrations ENABLE TRIGGER %I', t.trigger_name);
    END LOOP;
END $$;
