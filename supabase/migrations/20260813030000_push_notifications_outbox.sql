-- 1. Criar tabelas de Outbox e Entregas
CREATE TABLE IF NOT EXISTS public.push_notification_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    notification_id uuid REFERENCES public.notifications(id) ON DELETE CASCADE,
    player_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed')),
    attempts integer DEFAULT 0,
    created_at timestamptz DEFAULT now(),
    processing_at timestamptz,
    sent_at timestamptz,
    failed_at timestamptz,
    last_error text,
    metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.push_deliveries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    outbox_id uuid REFERENCES public.push_notification_outbox(id) ON DELETE CASCADE,
    subscription_id uuid REFERENCES public.push_subscriptions(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending',
    sent_at timestamptz,
    error text,
    UNIQUE(outbox_id, subscription_id)
);

-- 2. Habilitar RLS e Permissões
ALTER TABLE public.push_notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.push_notification_outbox TO service_role;
GRANT ALL ON public.push_deliveries TO service_role;

-- 3. Refatorar trigger_push_notification para usar a outbox
CREATE OR REPLACE FUNCTION public.trigger_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.push_notification_outbox (notification_id, player_id)
    VALUES (NEW.id, NEW.player_id);
    RETURN NEW;
END;
$$ language plpgsql;

-- 4. Função para processar a outbox via HTTP
CREATE OR REPLACE FUNCTION public.process_push_outbox()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

        PERFORM
            extensions.http_post(
                'https://se-passou-e-ponto.lovable.app/api/public/push-trigger',
                jsonb_build_object(
                    'type', 'OUTBOX_PROCESS',
                    'outbox_id', v_outbox_id
                )::text,
                'application/json'
            );
    END IF;
END;
$$;

-- 5. Trigger para processamento imediato (outbox)
CREATE OR REPLACE FUNCTION public.trigger_process_outbox_immediate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.process_push_outbox();
    RETURN NEW;
END;
$$ language plpgsql;

DROP TRIGGER IF EXISTS on_outbox_created_process ON public.push_notification_outbox;
CREATE TRIGGER on_outbox_created_process
    AFTER INSERT ON public.push_notification_outbox
    FOR EACH ROW
    EXECUTE FUNCTION public.trigger_process_outbox_immediate();
