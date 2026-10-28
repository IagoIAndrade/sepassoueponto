DO $$
DECLARE
    v_test_group_id UUID;
    v_source_group_id UUID := '387c23a9-23b8-485d-91bc-6d7ccfb759e3'; -- Terça
    v_player1 UUID := '87b02f45-c861-4c1a-bfb7-65ce560e9b2f'; -- Juliana
    v_player2 UUID := '59361a42-7c6b-4802-8507-6307f5c0b9cc'; -- Thiago
    v_player3 UUID := 'aaee0eb3-95fc-404d-bded-14dc9a64b025'; -- Robert
    v_player_control UUID := '0815ccc2-9673-4ea5-a140-767717e77b12'; -- Admin Lovable
    v_opens_at TIMESTAMPTZ;
    v_event_id UUID;
BEGIN
    -- 1. Criar Grupo Temporário Inativo
    INSERT INTO public.groups (name, slug, active, sort_order)
    VALUES ('TEST_GROUP_AUTOMATION', 'test-automation-' || extract(epoch from now())::text, false, 9999)
    RETURNING id INTO v_test_group_id;

    -- 2. Copiar app_settings
    INSERT INTO public.app_settings (group_id, main_limit, open_weekday, open_time, priority_minutes, access_restriction_active)
    SELECT v_test_group_id, main_limit, open_weekday, open_time, priority_minutes, access_restriction_active
    FROM public.app_settings WHERE group_id = v_source_group_id;

    -- 3. Associar Jogadores
    INSERT INTO public.player_groups (player_id, group_id, status, is_organizer, organizer_order)
    VALUES 
        (v_player1, v_test_group_id, 'approved', true, 1),
        (v_player2, v_test_group_id, 'approved', true, 2),
        (v_player3, v_test_group_id, 'approved', true, 3),
        (v_player_control, v_test_group_id, 'approved', false, null);

    -- 4. Criar Evento Agendado (+5 minutos)
    v_opens_at := (now() AT TIME ZONE 'UTC' + interval '5 minutes');
    
    INSERT INTO public.volleyball_events (
        group_id, event_date, status, opens_at, main_limit, 
        location, start_time, end_time, timezone
    )
    SELECT 
        v_test_group_id, 
        (CURRENT_DATE + interval '2 years')::date,
        'scheduled', 
        v_opens_at,
        18,
        location, start_time, end_time, timezone
    FROM public.app_settings 
    WHERE group_id = v_source_group_id
    LIMIT 1
    RETURNING id INTO v_event_id;
END $$;
