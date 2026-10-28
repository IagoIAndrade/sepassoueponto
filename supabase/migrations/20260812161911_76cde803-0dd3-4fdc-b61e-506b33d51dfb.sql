-- LIMPEZA TOTAL SEGURA
DO $$
DECLARE
    v_test_group_id UUID;
    v_test_event_id UUID := '9b090b8a-45cf-417b-9a12-bc253f7fba0d';
BEGIN
    SELECT id INTO v_test_group_id FROM public.groups WHERE name = 'TEST_GROUP_AUTOMATION' LIMIT 1;

    IF v_test_group_id IS NOT NULL THEN
        DELETE FROM public.registrations WHERE event_id = v_test_event_id;
        DELETE FROM public.notifications WHERE event_id = v_test_event_id;
        DELETE FROM public.volleyball_events WHERE group_id = v_test_group_id;
        DELETE FROM public.player_groups WHERE group_id = v_test_group_id;
        DELETE FROM public.app_settings WHERE group_id = v_test_group_id;
        DELETE FROM public.groups WHERE id = v_test_group_id;
    END IF;
END $$;
