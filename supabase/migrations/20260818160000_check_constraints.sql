-- Verificar e desabilitar constraints CHECK na tabela registrations.

DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN (
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'registrations' AND constraint_type = 'CHECK'
    ) LOOP
        EXECUTE format('ALTER TABLE public.registrations DROP CONSTRAINT %I', c.constraint_name);
    END LOOP;
END $$;
