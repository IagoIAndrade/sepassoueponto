-- Migração para hospedagem própria (Easypanel), fora do Lovable.
-- 1) O processamento da outbox de push passa a chamar o novo domínio.
-- 2) Garante as extensões e os jobs do pg_cron, que não voltam num pg_restore.

CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.process_push_outbox() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_outbox_id uuid;
BEGIN
    SELECT id INTO v_outbox_id
    FROM public.push_notification_outbox
    WHERE status = 'pending' AND attempts < 5
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED;

    IF v_outbox_id IS NOT NULL THEN
        UPDATE public.push_notification_outbox
        SET status = 'processing', processing_at = now(), attempts = attempts + 1
        WHERE id = v_outbox_id;

        BEGIN
            PERFORM
                extensions.http_post(
                    'https://aplicacoes-sepassoueponto.4nki4e.easypanel.host/api/public/push-trigger',
                    jsonb_build_object(
                        'type', 'OUTBOX_PROCESS',
                        'outbox_id', v_outbox_id
                    )::text,
                    'application/json'
                );
        EXCEPTION WHEN OTHERS THEN
            NULL;
        END;
    END IF;
END;
$$;

-- cron.schedule com nome atualiza o job se ele já existir
SELECT cron.schedule('volleyball-tick-events', '*/5 * * * *', 'SELECT public.tick_events();');
SELECT cron.schedule('volleyball-cleanup', '0 3 * * *', 'SELECT public.cleanup_expired();');
SELECT cron.schedule('process_event_openings', '* * * * *', 'SELECT public.internal_process_due_event_openings()');
SELECT cron.schedule('round_cycling_job', '* * * * *', 'SELECT public.internal_cycle_rounds()');
