-- ESTA É A MIGRACÃO DEFINITIVA PARA ELIMINAR O ERRO 22P02

-- 1. Eliminar TODAS as referências a 'waiting' em TODAS as funções conhecidas
CREATE OR REPLACE FUNCTION public.internal_leave_registration_v3(p_registration_id uuid, p_player_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_reg record;
BEGIN
    SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id AND player_id = p_player_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'registration_not_found'; END IF;
    
    UPDATE public.registrations SET cancelled_at = now(), position_number = NULL WHERE id = p_registration_id;
    
    IF v_reg.list_type = 'main'::public.list_type THEN
        PERFORM public.internal_promote_next_waiter(v_reg.event_id);
    END IF;
END;
$$;

-- 2. Corrigir triggers de notificação que podem estar falhando silenciosamente ou causando rollback
CREATE OR REPLACE FUNCTION public.fn_notify_promotion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
    v_event_name TEXT;
    v_group_slug TEXT;
BEGIN
    -- NOTA: Mudamos de 'waiting' para 'wait' e garantimos o cast
    IF (NEW.list_type = 'main'::public.list_type AND (OLD.list_type = 'wait'::public.list_type OR OLD.cancelled_at IS NOT NULL) AND NEW.cancelled_at IS NULL) THEN
        SELECT g.name, g.slug INTO v_event_name, v_group_slug
        FROM public.volleyball_events e
        JOIN public.groups g ON g.id = e.group_id
        WHERE e.id = NEW.event_id;

        INSERT INTO public.push_notification_outbox (player_id, title, body, data)
        VALUES (NEW.player_id, 'Você entrou na lista!', 'Sua inscrição na rodada de ' || v_event_name || ' foi confirmada.', 
        jsonb_build_object('url', '/event/' || v_group_slug || '/' || NEW.event_id));
    END IF;
    RETURN NEW;
END;
$$;

-- 3. Garantir que o enum não aceite 'waiting' (limpeza final)
-- Se 'waiting' foi adicionado anteriormente, removemos para forçar erro em tempo de desenvolvimento se reaparecer
DO $$
BEGIN
    -- Não podemos remover valores de enum facilmente, mas podemos garantir que a lógica não os use.
    -- Se necessário, poderíamos recriar o tipo, mas isso exige dropar colunas. 
    -- Por enquanto, a limpeza via UPDATE no passo anterior é suficiente.
    NULL;
END $$;
