CREATE OR REPLACE FUNCTION public.internal_is_blocked(
    p_player_id uuid, 
    p_event_date date,
    p_group_id uuid DEFAULT NULL
)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.player_blocks b
    WHERE b.player_id = p_player_id
      AND b.active = true
      AND p_event_date BETWEEN b.starts_at AND b.ends_at
  )
$function$;

GRANT EXECUTE ON FUNCTION public.internal_is_blocked(uuid, date, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.internal_is_blocked(uuid, date, uuid) TO service_role;
