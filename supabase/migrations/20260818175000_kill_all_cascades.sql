-- Investigar triggers em OUTRAS tabelas que referenciam registrations.

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN (
        SELECT trigger_name, event_object_table 
        FROM information_schema.triggers 
        WHERE routine_definition LIKE '%registrations%'
    ) LOOP
        EXECUTE format('ALTER TABLE %I DISABLE TRIGGER %I', t.event_object_table, t.trigger_name);
    END LOOP;
END $$;
