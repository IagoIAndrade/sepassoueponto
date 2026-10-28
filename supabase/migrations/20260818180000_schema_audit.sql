CREATE TABLE IF NOT EXISTS public.audit_results (
    id serial primary key,
    object_name text,
    object_type text,
    definition text,
    found_waiting boolean
);

TRUNCATE public.audit_results;

-- Audit Enums
INSERT INTO public.audit_results (object_name, object_type, definition)
SELECT t.typname, 'ENUM', string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder)
FROM pg_enum e
JOIN pg_type t ON e.enumtypid = t.oid
WHERE t.typname = 'list_type'
GROUP BY t.typname;

-- Audit Functions and Triggers
INSERT INTO public.audit_results (object_name, object_type, definition, found_waiting)
SELECT 
    n.nspname || '.' || p.proname as name,
    'FUNCTION',
    pg_get_functiondef(p.oid),
    pg_get_functiondef(p.oid) LIKE '%waiting%'
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public';

-- Audit Triggers specifically
INSERT INTO public.audit_results (object_name, object_type, definition, found_waiting)
SELECT 
    tgname,
    'TRIGGER',
    pg_get_triggerdef(t.oid),
    pg_get_triggerdef(t.oid) LIKE '%waiting%'
FROM pg_trigger t
WHERE NOT tgisinternal;

-- Audit Views
INSERT INTO public.audit_results (object_name, object_type, definition, found_waiting)
SELECT 
    viewname,
    'VIEW',
    definition,
    definition LIKE '%waiting%'
FROM pg_views
WHERE schemaname = 'public';

-- Audit Policies
INSERT INTO public.audit_results (object_name, object_type, definition, found_waiting)
SELECT 
    policyname,
    'POLICY',
    qual || ' ' || with_check,
    (qual || ' ' || with_check) LIKE '%waiting%'
FROM pg_policy;

-- Audit Constraints
INSERT INTO public.audit_results (object_name, object_type, definition, found_waiting)
SELECT 
    conname,
    'CONSTRAINT',
    pg_get_constraintdef(oid),
    pg_get_constraintdef(oid) LIKE '%waiting%'
FROM pg_constraint
WHERE connamespace = 'public'::regnamespace;

-- Audit Column Defaults
INSERT INTO public.audit_results (object_name, object_type, definition, found_waiting)
SELECT 
    table_name || '.' || column_name,
    'COLUMN_DEFAULT',
    column_default,
    column_default LIKE '%waiting%'
FROM information_schema.columns
WHERE table_schema = 'public' AND column_default IS NOT NULL;
