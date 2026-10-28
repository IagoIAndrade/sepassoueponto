-- 1. Função para criar notificações de promoção (Reserva -> Titular)
CREATE OR REPLACE FUNCTION public.fn_notify_promotion()
RETURNS TRIGGER AS $$
DECLARE
    v_event_name TEXT;
    v_group_id UUID;
BEGIN
    -- Se mudou para 'main' e antes não era 'main' (ou era cancelada)
    IF (NEW.list_type = 'main' AND (OLD.list_type IS NULL OR OLD.list_type = 'waiting' OR OLD.cancelled_at IS NOT NULL) AND NEW.cancelled_at IS NULL) THEN
        
        SELECT g.name, e.group_id INTO v_event_name, v_group_id
        FROM public.volleyball_events e
        JOIN public.groups g ON g.id = e.group_id
        WHERE e.id = NEW.event_id;

        INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
        VALUES (
            NEW.player_id, 
            'promoted_to_main', 
            v_group_id, 
            NEW.event_id, 
            jsonb_build_object('message', 'Sua vaga para ' || v_event_name || ' foi confirmada.'),
            'promo-' || NEW.player_id || '-' || NEW.event_id
        )
        ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_promotion
AFTER UPDATE ON public.registrations
FOR EACH ROW
WHEN (OLD.list_type IS DISTINCT FROM NEW.list_type OR OLD.cancelled_at IS DISTINCT FROM NEW.cancelled_at)
EXECUTE FUNCTION public.fn_notify_promotion();

-- 2. Função para notificar cancelamento de rodada
CREATE OR REPLACE FUNCTION public.fn_notify_event_cancelled()
RETURNS TRIGGER AS $$
DECLARE
    v_event_name TEXT;
    v_player_id UUID;
BEGIN
    IF (NEW.status = 'cancelled' AND OLD.status != 'cancelled') THEN
        SELECT g.name INTO v_event_name
        FROM public.groups g
        WHERE g.id = NEW.group_id;

        -- Notificar todos os inscritos ativos
        FOR v_player_id IN 
            SELECT player_id FROM public.registrations 
            WHERE event_id = NEW.id AND cancelled_at IS NULL
        LOOP
            INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
            VALUES (
                v_player_id, 
                'event_cancelled', 
                NEW.group_id, 
                NEW.id, 
                jsonb_build_object('message', 'O jogo de ' || v_event_name || ', ' || to_char(NEW.event_date, 'DD/MM') || ', foi cancelado.'),
                'cancel-' || v_player_id || '-' || NEW.id
            )
            ON CONFLICT (idempotency_key) DO NOTHING;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_event_cancelled
AFTER UPDATE ON public.volleyball_events
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.fn_notify_event_cancelled();

-- 3. Função para notificar abertura de lista
CREATE OR REPLACE FUNCTION public.fn_notify_list_opened()
RETURNS TRIGGER AS $$
DECLARE
    v_event_name TEXT;
    v_player_id UUID;
BEGIN
    IF (NEW.status = 'open' AND OLD.status = 'scheduled') THEN
        SELECT g.name INTO v_event_name
        FROM public.groups g
        WHERE g.id = NEW.group_id;

        -- Notificar todos os jogadores que têm acesso a este grupo
        FOR v_player_id IN 
            SELECT player_id FROM public.player_groups 
            WHERE group_id = NEW.group_id AND status = 'approved'
        LOOP
            INSERT INTO public.notifications (player_id, type, group_id, event_id, metadata, idempotency_key)
            VALUES (
                v_player_id, 
                'registration_opened', 
                NEW.group_id, 
                NEW.id, 
                jsonb_build_object('message', 'A lista de ' || v_event_name || ' já está disponível.'),
                'open-' || v_player_id || '-' || NEW.id
            )
            ON CONFLICT (idempotency_key) DO NOTHING;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_list_opened
AFTER UPDATE ON public.volleyball_events
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.fn_notify_list_opened();
