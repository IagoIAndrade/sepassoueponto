CREATE OR REPLACE FUNCTION public.fn_notify_promotion()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_event_name TEXT;
    v_group_slug TEXT;
BEGIN
    -- Corrigido: Removido 'waiting' (inválido no enum) e adicionado 'wait'::public.list_type com cast explícito
    IF (NEW.list_type = 'main'::public.list_type AND (OLD.list_type = 'wait'::public.list_type OR OLD.cancelled_at IS NOT NULL) AND NEW.cancelled_at IS NULL) THEN
        
        SELECT g.name, g.slug INTO v_event_name, v_group_slug
        FROM public.volleyball_events e
        JOIN public.groups g ON g.id = e.group_id
        WHERE e.id = NEW.event_id;

        -- Unificado com a tabela de outbox de push que é o padrão atual do sistema
        INSERT INTO public.push_notification_outbox (player_id, title, body, data)
        VALUES (
            NEW.player_id, 
            'Você entrou na lista!', 
            'Sua inscrição na rodada de ' || v_event_name || ' foi confirmada.', 
            jsonb_build_object('url', '/event/' || v_group_slug || '/' || NEW.event_id)
        );
    END IF;
    RETURN NEW;
END;
$function$;