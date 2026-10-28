ALTER TABLE public.notifications ADD CONSTRAINT notifications_idempotency_key_key UNIQUE (idempotency_key);

CREATE OR REPLACE FUNCTION public.fn_notify_promotion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_event_name TEXT;
    v_group_id UUID;
BEGIN
    -- Se mudou para 'main' e antes não era 'main' (ou era cancelada)
    -- list_type é public.list_type (enum com 'main' e 'wait')
    IF (NEW.list_type::text = 'main' AND (OLD.list_type IS NULL OR OLD.list_type::text = 'wait' OR OLD.cancelled_at IS NOT NULL) AND NEW.cancelled_at IS NULL) THEN
        
        SELECT g.name, e.group_id INTO v_event_name, v_group_id
        FROM public.volleyball_events e
        JOIN public.groups g ON g.id = e.group_id
        WHERE e.id = NEW.event_id;

        INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
        VALUES (
            NEW.player_id, 
            'promoted_to_main'::public.notification_type, 
            v_group_id, 
            NEW.event_id, 
            jsonb_build_object('message', 'Sua vaga para ' || v_event_name || ' foi confirmada.'),
            'promo-' || NEW.player_id || '-' || NEW.event_id || '-' || extract(epoch from now())::text
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$function$;