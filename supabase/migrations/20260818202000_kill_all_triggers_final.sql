-- 1. DROP ALL TRIGGERS ON registrations JUST IN CASE
DO $$ 
DECLARE
    r RECORD;
BEGIN
    FOR r IN (SELECT tgname FROM pg_trigger JOIN pg_class ON pg_trigger.tgrelid = pg_class.oid WHERE relname = 'registrations' AND NOT tgisinternal) LOOP
        EXECUTE 'DROP TRIGGER IF EXISTS ' || quote_ident(r.tgname) || ' ON public.registrations';
    END LOOP;
END $$;

-- 2. CREATE A CLEAN TRIGGER FOR PROMOTION
CREATE OR REPLACE FUNCTION public.fn_promote_atomic()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Only trigger on manual updates to cancelled_at
    IF (OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL AND OLD.list_type = 'main'::public.list_type) THEN
        PERFORM public.internal_promote_next_waiter(OLD.event_id);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER tr_promote_after_cancel
    AFTER UPDATE OF cancelled_at ON public.registrations
    FOR EACH ROW
    WHEN (OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL)
    EXECUTE FUNCTION public.fn_promote_atomic();

-- 3. ENSURE push notifications don't break things if they have old code
CREATE OR REPLACE FUNCTION public.fn_notify_promotion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- No logic here for now to avoid side effects
    RETURN NEW;
END;
$$;
