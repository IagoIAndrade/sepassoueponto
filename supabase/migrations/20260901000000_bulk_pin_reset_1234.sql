-- Migration: Bulk PIN reset to 1234 for all existing players
-- Creates log table for idempotency and executes the reset.

CREATE TABLE IF NOT EXISTS public._sys_bulk_pin_reset_log (
    player_id uuid PRIMARY KEY REFERENCES public.players(id) ON DELETE CASCADE,
    reset_at timestamptz NOT NULL DEFAULT now(),
    success boolean NOT NULL,
    error_message text
);

GRANT ALL ON public._sys_bulk_pin_reset_log TO authenticated, service_role;

ALTER TABLE public._sys_bulk_pin_reset_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view bulk pin reset log" ON public._sys_bulk_pin_reset_log;
CREATE POLICY "Admins can view bulk pin reset log" 
ON public._sys_bulk_pin_reset_log 
FOR SELECT 
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DO $$
DECLARE
    v_player record;
    v_hash text;
    v_success int := 0;
    v_failed int := 0;
    v_total int := 0;
BEGIN
    v_hash := public.hash_pin('1234');
    
    FOR v_player IN 
        SELECT id FROM public.players 
        WHERE id NOT IN (SELECT player_id FROM public._sys_bulk_pin_reset_log WHERE success = true) 
    LOOP
        v_total := v_total + 1;
        BEGIN
            UPDATE public.players 
            SET pin_hash = v_hash, 
                must_change_pin = true, 
                updated_at = now() 
            WHERE id = v_player.id;
            
            -- Revoke sessions exactly like admin_request_pin_reset does
            DELETE FROM public.player_sessions WHERE player_id = v_player.id;
            
            INSERT INTO public._sys_bulk_pin_reset_log (player_id, success) 
            VALUES (v_player.id, true)
            ON CONFLICT (player_id) DO UPDATE SET success = true, error_message = NULL, reset_at = now();
            
            v_success := v_success + 1;
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO public._sys_bulk_pin_reset_log (player_id, success, error_message) 
            VALUES (v_player.id, false, SQLERRM)
            ON CONFLICT (player_id) DO UPDATE SET success = false, error_message = SQLERRM, reset_at = now();
            
            v_failed := v_failed + 1;
        END;
    END LOOP;
    
    RAISE NOTICE 'Bulk PIN Reset Completed. Processed: %, Success: %, Failed: %', v_total, v_success, v_failed;
END;
$$;
