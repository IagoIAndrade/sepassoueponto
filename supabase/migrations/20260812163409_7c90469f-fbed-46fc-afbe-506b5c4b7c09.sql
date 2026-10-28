-- IDs fixos para o bloco de migração
DO $$
DECLARE
    v_test_group_id UUID := '77777777-7777-7777-7777-777777777777';
    v_source_group_id UUID := '387c23a9-23b8-485d-91bc-6d7ccfb759e3'; -- Terça
    v_opens_at TIMESTAMPTZ := now() + interval '5 minutes';
    v_test_event_id UUID := '88888888-8888-8888-8888-888888888888';
BEGIN
    -- 4. CRIAR TEST_GROUP (slug único com timestamp)
    INSERT INTO public.groups (id, name, slug, active)
    VALUES (v_test_group_id, 'TEST_GROUP_AUTOMATION', 'test-automation-' || extract(epoch from now()), false);

    -- 5. CRIAR CONFIGURAÇÕES (Schema Real)
    INSERT INTO public.app_settings (
        group_id, 
        event_name, 
        main_limit, 
        priority_minutes,
        location,
        start_time,
        end_time,
        timezone,
        open_time,
        list_open_time
    )
    SELECT 
        v_test_group_id, 
        'TEST EVENT AUTOMATION', 
        main_limit, 
        priority_minutes,
        location,
        start_time,
        end_time,
        timezone,
        open_time,
        list_open_time
    FROM public.app_settings 
    WHERE group_id = v_source_group_id;

    -- 6. ASSOCIAR OS QUATRO PLAYERS
    -- TEST_PLAYER_1: Juliana Ribeiro Marques
    INSERT INTO public.player_groups (player_id, group_id, status, is_organizer, organizer_order)
    VALUES ('87b02f45-c861-4c1a-bfb7-65ce560e9b2f', v_test_group_id, 'approved', true, 1);
    
    -- TEST_PLAYER_2: Thiago Filipe
    INSERT INTO public.player_groups (player_id, group_id, status, is_organizer, organizer_order)
    VALUES ('59361a42-7c6b-4802-8507-6307f5c0b9cc', v_test_group_id, 'approved', true, 2);
    
    -- TEST_PLAYER_3: Robert Tadeu
    INSERT INTO public.player_groups (player_id, group_id, status, is_organizer, organizer_order)
    VALUES ('aaee0eb3-95fc-404d-bded-14dc9a64b025', v_test_group_id, 'approved', true, 3);
    
    -- TEST_PLAYER_CONTROL: Admin Lovable
    INSERT INTO public.player_groups (player_id, group_id, status, is_organizer, organizer_order)
    VALUES ('0815ccc2-9673-4ea5-a140-767717e77b12', v_test_group_id, 'approved', false, NULL);

    -- 7. CRIAR TEST_EVENT (Copiando valores obrigatórios do snapshot de Terça se necessário)
    -- NOTA: O erro anterior mostrou que 'location' é NOT NULL. 
    -- Vamos garantir que todos os campos obrigatórios sejam preenchidos a partir do snapshot estrutural.
    INSERT INTO public.volleyball_events (
        id, 
        group_id, 
        event_date, 
        status, 
        opens_at, 
        organizers_auto_enrolled_at,
        location,
        start_time,
        end_time,
        main_limit,
        timezone,
        priority_minutes
    )
    SELECT 
        v_test_event_id, 
        v_test_group_id, 
        CURRENT_DATE + interval '30 days', 
        'scheduled', 
        v_opens_at, 
        NULL,
        location,
        start_time,
        end_time,
        main_limit,
        timezone,
        priority_minutes
    FROM public.app_settings 
    WHERE group_id = v_source_group_id;
END $$;