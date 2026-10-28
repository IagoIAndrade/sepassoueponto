CREATE TABLE IF NOT EXISTS public.debug_logs (
    id serial primary key,
    ts timestamptz default now(),
    msg text,
    data jsonb
);

TRUNCATE public.debug_logs;

INSERT INTO public.debug_logs (msg, data)
SELECT 'list_type_enum', jsonb_agg(enumlabel) FROM pg_enum WHERE enumtypid = 'public.list_type'::regtype;

INSERT INTO public.debug_logs (msg, data)
SELECT 'registrations_sample', jsonb_agg(t) FROM (SELECT id, list_type, position_number, cancelled_at FROM public.registrations LIMIT 5) t;

GRANT SELECT ON public.debug_logs TO anon;
