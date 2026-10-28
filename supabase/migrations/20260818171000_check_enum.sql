-- Inspecionar os valores do enum list_type.

DO $$
DECLARE
    v_val text;
BEGIN
    FOR v_val IN SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.list_type'::regtype LOOP
        RAISE NOTICE 'Enum value: %', v_val;
    END LOOP;
END $$;
