CREATE OR REPLACE FUNCTION public.fn_notify_promotion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_event_name TEXT;
    v_group_slug TEXT;
BEGIN
    -- Reconciliação com o schema real de push_notification_outbox
    -- Colunas 'title' e 'body' não existem no schema físico, devem ir para 'metadata'
    IF (NEW.list_type = 'main'::public.list_type AND (OLD.list_type = 'wait'::public.list_type OR OLD.cancelled_at IS NOT NULL) AND NEW.cancelled_at IS NULL) THEN
        SELECT g.name, g.slug INTO v_event_name, v_group_slug
        FROM public.volleyball_events e
        JOIN public.groups g ON g.id = e.group_id
        WHERE e.id = NEW.event_id;

        INSERT INTO public.push_notification_outbox (player_id, metadata)
        VALUES (
            NEW.player_id, 
            jsonb_build_object(
                'title', 'Você entrou na lista!', 
                'body', 'Sua inscrição na rodada de ' || v_event_name || ' foi confirmada.',
                'url', '/event/' || v_group_slug || '/' || NEW.event_id,
                'type', 'promoted_to_main'
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

-- Criar tabela de log de auditoria se não existir (para evitar que admin_remove_registration_v3 quebre)
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id uuid REFERENCES auth.users(id),
    action text NOT NULL,
    target_id uuid,
    details jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz DEFAULT now()
);

GRANT INSERT, SELECT ON public.admin_audit_logs TO authenticated;
GRANT ALL ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
