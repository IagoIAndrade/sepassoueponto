DROP FUNCTION IF EXISTS public.get_public_registrations(uuid);

CREATE OR REPLACE FUNCTION public.get_public_registrations(p_event_id uuid)
 RETURNS TABLE(
   id uuid,
   player_id uuid,
   player_name text,
   player_avatar_path text,
   player_phone_normalized text,
   list_type list_type,
   position_number integer,
   created_at timestamp with time zone,
   primary_position text
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT 
    r.id, 
    p.id as player_id, 
    p.name as player_name, 
    p.avatar_path as player_avatar_path, 
    p.phone_normalized as player_phone_normalized,
    r.list_type, 
    r.position_number, 
    r.created_at,
    ps.primary_position
  FROM public.registrations r
  JOIN public.players p ON p.id = r.player_id
  LEFT JOIN public.player_skills ps ON ps.player_id = p.id
  WHERE r.event_id = p_event_id AND r.cancelled_at IS NULL
  ORDER BY r.created_at ASC, r.id ASC;
$function$;