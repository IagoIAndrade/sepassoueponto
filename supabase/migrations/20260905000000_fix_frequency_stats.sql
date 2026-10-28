CREATE OR REPLACE FUNCTION public.admin_get_frequency_stats(p_group_id uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_page integer DEFAULT 1, p_limit integer DEFAULT 50, p_recent_limit integer DEFAULT 14, p_attention_limit integer DEFAULT 29, p_status_filter text DEFAULT NULL::text, p_sort_by text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_offset integer := (p_page - 1) * p_limit;
  v_total integer;
  v_first_recorded date := '2026-10-09'::date;
  v_result jsonb;
  v_status text := COALESCE(p_status_filter, 'all');
  v_sort text := COALESCE(p_sort_by, 'days_desc');
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  WITH base_players AS (
    SELECT 
      p.id as player_id,
      p.name,
      p.phone_normalized,
      p.avatar_path,
      p.created_at,
      p.active
    FROM public.players p
    WHERE COALESCE(p.is_guest, false) = false
      AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%' OR p.phone_normalized ILIKE '%' || p_search || '%')
  ),
  player_stats AS (
    SELECT
      bp.*,
      MAX(CASE WHEN r.list_type = 'main' AND r.cancelled_at IS NULL AND e.status IN ('completed', 'closed') AND e.event_date >= v_first_recorded THEN e.event_date ELSE NULL END) as last_presence_date,
      COUNT(CASE WHEN r.list_type = 'main' AND r.cancelled_at IS NULL AND e.status IN ('completed', 'closed') AND e.event_date >= v_first_recorded AND e.event_date >= CURRENT_DATE - 30 THEN 1 END) as presences_30d,
      COUNT(CASE WHEN r.list_type = 'main' AND r.cancelled_at IS NULL AND e.status IN ('completed', 'closed') AND e.event_date >= v_first_recorded AND e.event_date >= CURRENT_DATE - 60 THEN 1 END) as presences_60d,
      COUNT(CASE WHEN r.list_type = 'main' AND r.cancelled_at IS NULL AND e.status IN ('completed', 'closed') AND e.event_date >= v_first_recorded AND e.event_date >= CURRENT_DATE - 90 THEN 1 END) as presences_90d
    FROM base_players bp
    LEFT JOIN public.registrations r ON r.player_id = bp.player_id
    LEFT JOIN public.volleyball_events e ON e.id = r.event_id 
      AND (p_group_id IS NULL OR e.group_id = p_group_id)
    GROUP BY bp.player_id, bp.name, bp.phone_normalized, bp.avatar_path, bp.created_at, bp.active
  ),
  approved_groups AS (
    SELECT pg.player_id, array_agg(g.name) as groups_array
    FROM public.player_groups pg
    JOIN public.groups g ON g.id = pg.group_id
    WHERE pg.status = 'approved'
    GROUP BY pg.player_id
  ),
  final_stats AS (
    SELECT 
      ps.*,
      ag.groups_array,
      CASE WHEN ps.last_presence_date IS NOT NULL THEN CURRENT_DATE - ps.last_presence_date ELSE NULL END as days_since_last,
      CURRENT_DATE - ps.created_at::date as days_since_created
    FROM player_stats ps
    LEFT JOIN approved_groups ag ON ag.player_id = ps.player_id
  ),
  filtered_stats AS (
    SELECT * FROM final_stats
    WHERE 
      v_status = 'all' OR
      (v_status = 'recent' AND days_since_last IS NOT NULL AND days_since_last <= p_recent_limit) OR
      (v_status = 'attention' AND days_since_last IS NOT NULL AND days_since_last > p_recent_limit AND days_since_last <= p_attention_limit) OR
      (v_status = 'absent' AND days_since_last IS NOT NULL AND days_since_last > p_attention_limit) OR
      (v_status = 'no_record' AND days_since_last IS NULL)
  ),
  counted AS (
    SELECT count(*) as total_count FROM filtered_stats
  ),
  paginated AS (
    SELECT * FROM filtered_stats
    ORDER BY 
      CASE WHEN v_sort = 'days_desc' THEN (CASE WHEN days_since_last IS NULL THEN -1 ELSE days_since_last END) END DESC NULLS LAST,
      CASE WHEN v_sort = 'days_asc'  THEN (CASE WHEN days_since_last IS NULL THEN 999999 ELSE days_since_last END) END ASC NULLS LAST,
      name ASC
    LIMIT p_limit OFFSET v_offset
  )
  SELECT 
    jsonb_build_object(
      'players', COALESCE((SELECT jsonb_agg(row_to_json(p.*)) FROM paginated p), '[]'::jsonb),
      'total', COALESCE((SELECT total_count FROM counted), 0),
      'first_recorded_date', v_first_recorded
    ) INTO v_result;

  RETURN v_result;
END;
$function$;
