
DO $$
DECLARE
    v_event_id uuid := 'e2e00000-0000-0000-0000-000000000002';
    v_player_id uuid;
    v_reg_id uuid;
    v_admin_id uuid;
BEGIN
    INSERT INTO public.groups (id, name, slug, active, sort_order)
    VALUES ('e2e00000-0000-0000-0000-000000000000', 'TURMA E2E TEST', 'e2e-test', true, 999)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

    INSERT INTO public.volleyball_events (id, group_id, event_date, status, start_time, end_time, opens_at, location, main_limit)
    VALUES (v_event_id, 'e2e00000-0000-0000-0000-000000000000', '2026-12-31', 'open', '19:00', '21:00', now(), 'Quadra E2E', 18)
    ON CONFLICT (id) DO UPDATE SET status = 'open';

    INSERT INTO public.app_settings (group_id, main_limit, auto_promote_reservations)
    VALUES ('e2e00000-0000-0000-0000-000000000000', 18, true)
    ON CONFLICT (group_id) DO UPDATE SET main_limit = 18;

    FOR i IN 1..20 LOOP
        v_player_id := ('11111111-1111-1111-1111-' || LPAD(i::text, 12, '0'))::uuid;
        INSERT INTO public.players (id, name, phone, phone_normalized, active, pin_hash)
        VALUES (v_player_id, 'Player E2E ' || i, '1199999' || LPAD(i::text, 2, '0'), '+551199999' || LPAD(i::text, 2, '0'), true, 'dummy')
        ON CONFLICT (id) DO NOTHING;
    END LOOP;

    v_admin_id := ('11111111-1111-1111-1111-' || LPAD('1', 12, '0'))::uuid;
    DELETE FROM public.registrations WHERE event_id = v_event_id;

    FOR i IN 1..18 LOOP
        v_player_id := ('11111111-1111-1111-1111-' || LPAD(i::text, 12, '0'))::uuid;
        INSERT INTO public.registrations (event_id, player_id, list_type, position_number, created_at, registered_by_player_id)
        VALUES (v_event_id, v_player_id, 'main', i, '2026-08-18 10:00:00'::timestamp + (i || ' minutes')::interval, v_player_id);
    END LOOP;

    FOR i IN 19..20 LOOP
        v_player_id := ('11111111-1111-1111-1111-' || LPAD(i::text, 12, '0'))::uuid;
        INSERT INTO public.registrations (event_id, player_id, list_type, position_number, created_at, registered_by_player_id)
        VALUES (v_event_id, v_player_id, 'wait', i - 18, '2026-08-18 11:00:00'::timestamp + (i || ' minutes')::interval, v_player_id);
    END LOOP;

    SELECT id INTO v_reg_id FROM public.registrations WHERE event_id = v_event_id AND position_number = 4 AND list_type = 'main';
    
    BEGIN
        PERFORM public.admin_remove_registration_v3(v_reg_id, v_admin_id);
        RAISE NOTICE 'Admin remove SUCCESS';
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'Admin remove FAILED: % %', SQLERRM, SQLSTATE;
    END;

    DECLARE
        v_count int;
        v_max_pos int;
    BEGIN
        SELECT count(*) INTO v_count FROM public.registrations WHERE event_id = v_event_id AND list_type = 'main' AND cancelled_at IS NULL;
        IF v_count != 18 THEN RAISE EXCEPTION 'Main list count mismatch: %', v_count; END IF;
        
        SELECT max(position_number) INTO v_max_pos FROM public.registrations WHERE event_id = v_event_id AND list_type = 'main' AND cancelled_at IS NULL;
        IF v_max_pos != 18 THEN RAISE EXCEPTION 'Main list max position mismatch: %', v_max_pos; END IF;

        SELECT count(*) INTO v_count FROM public.registrations WHERE event_id = v_event_id AND list_type = 'wait' AND cancelled_at IS NULL;
        IF v_count != 1 THEN RAISE EXCEPTION 'Wait list count mismatch: %', v_count; END IF;
        
        RAISE NOTICE 'Reordering and Promotion validation SUCCESS';
    END;

    -- Cleanup
    DELETE FROM public.registrations WHERE event_id = v_event_id;
    DELETE FROM public.volleyball_events WHERE id = v_event_id;
    -- Players and Group are reusable for other tests
END $$;
