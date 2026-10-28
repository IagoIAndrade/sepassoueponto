-- Correção definitiva do trigger de promoção que usava 'waiting' em vez de 'wait'.
-- Isso estava causando erros fatais em qualquer operação que ativasse o trigger.

CREATE OR REPLACE FUNCTION public.fn_notify_promotion()
RETURNS TRIGGER AS $$
DECLARE
    v_event_name TEXT;
    v_group_id UUID;
    v_group_slug TEXT;
    v_event_date DATE;
BEGIN
    -- Corrigido 'waiting' para 'wait'
    IF (NEW.list_type::text = 'main' AND (OLD.list_type IS NULL OR OLD.list_type::text = 'wait' OR OLD.cancelled_at IS NOT NULL) AND NEW.cancelled_at IS NULL) THEN
        
        SELECT g.name, g.slug, e.group_id, e.event_date INTO v_event_name, v_group_slug, v_group_id, v_event_date
        FROM public.volleyball_events e
        JOIN public.groups g ON g.id = e.group_id
        WHERE e.id = NEW.event_id;

        INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
        VALUES (
            NEW.player_id, 
            'promoted_to_main', 
            v_group_slug, 
            NEW.event_id, 
            jsonb_build_object(
                'turma', v_event_name,
                'data', to_char(v_event_date, 'DD/MM'),
                'data_hora', to_char(v_event_date, 'DD/MM')
            ),
            'promo-' || NEW.player_id || '-' || NEW.event_id
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
