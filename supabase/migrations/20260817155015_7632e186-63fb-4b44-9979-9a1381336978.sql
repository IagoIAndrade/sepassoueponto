-- 1. Melhorar metadados de promoção
CREATE OR REPLACE FUNCTION public.fn_notify_promotion()
RETURNS TRIGGER AS $$
DECLARE
    v_event_name TEXT;
    v_group_id UUID;
    v_group_slug TEXT;
    v_event_date DATE;
BEGIN
    IF (NEW.list_type = 'main' AND (OLD.list_type IS NULL OR OLD.list_type = 'waiting' OR OLD.cancelled_at IS NOT NULL) AND NEW.cancelled_at IS NULL) THEN
        
        SELECT g.name, g.slug, e.group_id, e.event_date INTO v_event_name, v_group_slug, v_group_id, v_event_date
        FROM public.volleyball_events e
        JOIN public.groups g ON g.id = e.group_id
        WHERE e.id = NEW.event_id;

        INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
        VALUES (
            NEW.player_id, 
            'promoted_to_main', 
            v_group_slug, -- Usando SLUG para deep link no frontend
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

-- 2. Melhorar metadados de cancelamento
CREATE OR REPLACE FUNCTION public.fn_notify_event_cancelled()
RETURNS TRIGGER AS $$
DECLARE
    v_event_name TEXT;
    v_group_slug TEXT;
    v_player_id UUID;
BEGIN
    IF (NEW.status = 'cancelled' AND OLD.status != 'cancelled') THEN
        SELECT g.name, g.slug INTO v_event_name, v_group_slug
        FROM public.groups g
        WHERE g.id = NEW.group_id;

        FOR v_player_id IN 
            SELECT player_id FROM public.registrations 
            WHERE event_id = NEW.id AND cancelled_at IS NULL
        LOOP
            INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
            VALUES (
                v_player_id, 
                'event_cancelled', 
                v_group_slug, 
                NEW.id, 
                jsonb_build_object(
                    'turma', v_event_name,
                    'data', to_char(NEW.event_date, 'DD/MM')
                ),
                'cancel-' || v_player_id || '-' || NEW.id
            )
            ON CONFLICT (idempotency_key) DO NOTHING;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Melhorar metadados de abertura
CREATE OR REPLACE FUNCTION public.fn_notify_list_opened()
RETURNS TRIGGER AS $$
DECLARE
    v_event_name TEXT;
    v_group_slug TEXT;
    v_player_id UUID;
BEGIN
    IF (NEW.status = 'open' AND OLD.status = 'scheduled') THEN
        SELECT g.name, g.slug INTO v_event_name, v_group_slug
        FROM public.groups g
        WHERE g.id = NEW.group_id;

        FOR v_player_id IN 
            SELECT player_id FROM public.player_groups 
            WHERE group_id = NEW.group_id AND status = 'approved'
        LOOP
            INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
            VALUES (
                v_player_id, 
                'registration_opened', 
                v_group_slug, 
                NEW.id, 
                jsonb_build_object(
                    'turma', v_event_name,
                    'data', to_char(NEW.event_date, 'DD/MM')
                ),
                'open-' || v_player_id || '-' || NEW.id
            )
            ON CONFLICT (idempotency_key) DO NOTHING;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;