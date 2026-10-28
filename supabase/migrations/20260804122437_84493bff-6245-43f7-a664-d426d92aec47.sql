CREATE OR REPLACE FUNCTION public.admin_list_players_to_review(p_search text DEFAULT NULL::text)
 RETURNS TABLE(player_id uuid, first_name text, last_name text, phone_normalized text, created_at timestamp with time zone, last_participation_date date, last_participation_group_name text, suggested_group_ids uuid[])
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    WITH player_history AS (
        SELECT 
            r.player_id,
            MAX(e.event_date) as last_date,
            ARRAY_AGG(DISTINCT e.group_id) as hist_groups
        FROM registrations r
        JOIN volleyball_events e ON r.event_id = e.id
        WHERE r.cancelled_at IS NULL
        GROUP BY r.player_id
    ),
    last_event_info AS (
        SELECT h.player_id, h.last_date, h.hist_groups, 
               (SELECT g.name 
                FROM registrations r2
                JOIN volleyball_events ve ON r2.event_id = ve.id 
                JOIN groups g ON ve.group_id = g.id 
                WHERE r2.player_id = h.player_id AND ve.event_date = h.last_date 
                LIMIT 1) as group_name
        FROM player_history h
    )
    SELECT 
        p.id as player_id,
        p.first_name,
        p.last_name,
        p.phone_normalized,
        p.created_at,
        lei.last_date as last_participation_date,
        lei.group_name as last_participation_group_name,
        COALESCE(lei.hist_groups, '{}'::uuid[]) as suggested_group_ids
    FROM players p
    LEFT JOIN last_event_info lei ON p.id = lei.player_id
    WHERE p.active = true
      AND NOT EXISTS (
          SELECT 1 FROM player_groups pg WHERE pg.player_id = p.id
      )
      AND (
          p_search IS NULL 
          OR (p.first_name || ' ' || COALESCE(p.last_name, '')) ILIKE '%' || p_search || '%'
          OR p.phone_normalized ILIKE '%' || p_search || '%'
      )
    ORDER BY p.first_name ASC, p.last_name ASC;
END;
$function$;
