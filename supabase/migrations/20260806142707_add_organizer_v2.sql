CREATE OR REPLACE FUNCTION public.admin_add_organizer_v2(
    p_player_id uuid,
    p_group_id uuid,
    p_order integer DEFAULT 99
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.player_groups (player_id, group_id, status, is_organizer, organizer_order)
    VALUES (p_player_id, p_group_id, "approved", true, p_order)
    ON CONFLICT (player_id, group_id) 
    DO UPDATE SET 
        status = "approved",
        is_organizer = true,
        organizer_order = p_order;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_add_organizer_v2(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_organizer_v2(uuid, uuid, integer) TO service_role;
