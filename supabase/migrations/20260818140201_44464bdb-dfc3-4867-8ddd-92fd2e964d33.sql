
DO $$
DECLARE
    v_event_id uuid := 'e2e00000-0000-0000-0000-000000000002';
    v_player_id uuid;
BEGIN
    INSERT INTO public.groups (id, name, slug, active, sort_order)
    VALUES ('e2e00000-0000-0000-0000-000000000000', 'TURMA E2E TEST', 'e2e-test', true, 999)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

    INSERT INTO public.volleyball_events (id, group_id, event_date, status, start_time, end_time, opens_at, location, main_limit)
    VALUES (v_event_id, 'e2e00000-0000-0000-0000-000000000000', '2026-12-31', 'open', '19:00', '21:00', now(), 'Quadra E2E', 18)
    ON CONFLICT (id) DO UPDATE SET status = 'open';

    FOR i IN 1..20 LOOP
        v_player_id := ('11111111-1111-1111-1111-' || LPAD(i::text, 12, '0'))::uuid;
        INSERT INTO public.players (id, name, phone, phone_normalized, active, pin_hash)
        VALUES (v_player_id, 'Player E2E ' || i, '1199999' || LPAD(i::text, 2, '0'), '+551199999' || LPAD(i::text, 2, '0'), true, 'dummy')
        ON CONFLICT (id) DO NOTHING;
    END LOOP;

    DELETE FROM public.registrations WHERE event_id = v_event_id;

    FOR i IN 1..18 LOOP
        v_player_id := ('11111111-1111-1111-1111-' || LPAD(i::text, 12, '0'))::uuid;
        INSERT INTO public.registrations (event_id, player_id, list_type, position_number, created_at, registered_by_player_id)
        VALUES (v_event_id, v_player_id, 'main', i, '2026-08-18 10:00:00'::timestamp + (i || ' minutes')::interval, v_player_id);
    END LOOP;

    -- TENTAR REPRODUZIR O ERRO
    UPDATE public.registrations SET cancelled_at = now() WHERE event_id = v_event_id AND position_number = 4 AND list_type = 'main';
    
    BEGIN
        -- Reordenar titular 4
        UPDATE public.registrations 
        SET position_number = position_number - 1
        WHERE event_id = v_event_id 
          AND list_type = 'main'
          AND cancelled_at IS NULL 
          AND position_number > 4;
          
        RAISE NOTICE 'SQL UPDATE set-based PASSED';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'SQL UPDATE set-based FAILED: %', SQLERRM;
    END;
END $$;
