-- Verificar se existe alguma RULE ou se a tabela é uma VIEW.

SELECT table_type FROM information_schema.tables WHERE table_name = 'registrations';

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT rulename FROM pg_rewrite WHERE ev_class = 'public.registrations'::regclass AND rulename <> '_RETURN') LOOP
        EXECUTE format('DROP RULE %I ON public.registrations', r.rulename);
    END LOOP;
END $$;
