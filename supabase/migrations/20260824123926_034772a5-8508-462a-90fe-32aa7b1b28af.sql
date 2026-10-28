CREATE OR REPLACE FUNCTION public.fn_notify_list_opened()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_event_name TEXT;
    v_group_slug TEXT;
    v_player_id UUID;
BEGIN
    IF (NEW.status = 'open' AND OLD.status IS DISTINCT FROM 'open') THEN
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
                NEW.group_id,
                NEW.id,
                jsonb_build_object(
                    'turma', v_event_name,
                    'slug', v_group_slug,
                    'data', to_char(NEW.event_date, 'DD/MM')
                ),
                'open-' || v_player_id || '-' || NEW.id
            )
            ON CONFLICT (idempotency_key) DO NOTHING;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$function$;