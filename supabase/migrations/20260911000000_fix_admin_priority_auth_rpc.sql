DROP FUNCTION IF EXISTS public.admin_list_global_priorities(text, text, integer, integer);
DROP FUNCTION IF EXISTS public.admin_set_global_priority(uuid, boolean);
DROP FUNCTION IF EXISTS public.admin_list_group_priorities(uuid, text);
DROP FUNCTION IF EXISTS public.admin_set_player_priority(uuid, uuid, boolean);

CREATE OR REPLACE FUNCTION public.admin_list_global_priorities(
  p_search text DEFAULT NULL::text, 
  p_filter text DEFAULT 'all'::text, 
  p_page integer DEFAULT 1, 
  p_limit integer DEFAULT 50,
  p_admin_user_id uuid DEFAULT NULL::uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_offset integer := (p_page - 1) * p_limit;
  v_total integer;
  v_result jsonb;
  v_uid uuid := coalesce(p_admin_user_id, auth.uid());
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN 
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; 
  END IF;

  WITH filtered AS (
    SELECT p.id as player_id, p.name, p.phone_normalized, p.avatar_path, COALESCE(p.has_global_priority, false) as has_priority
    FROM public.players p
    WHERE p.active = true AND COALESCE(p.is_guest, false) = false
      AND (p_search IS NULL OR p_search = '' OR p.name ILIKE '%' || p_search || '%' OR p.phone_normalized ILIKE '%' || p_search || '%')
      AND (p_filter = 'all' OR (p_filter = 'priority' AND COALESCE(p.has_global_priority, false) = true) OR (p_filter = 'no_priority' AND COALESCE(p.has_global_priority, false) = false))
  )
  SELECT count(*) INTO v_total FROM filtered;

  SELECT jsonb_agg(row_to_json(f.*))
  INTO v_result
  FROM (
    SELECT * FROM filtered
    ORDER BY name ASC
    LIMIT p_limit OFFSET v_offset
  ) f;

  RETURN jsonb_build_object(
    'players', COALESCE(v_result, '[]'::jsonb),
    'total', COALESCE(v_total, 0),
    'page', p_page,
    'limit', p_limit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_global_priority(
  p_player_id uuid, 
  p_has_priority boolean,
  p_admin_user_id uuid DEFAULT NULL::uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := coalesce(p_admin_user_id, auth.uid());
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN 
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; 
  END IF;
  
  UPDATE public.players SET has_global_priority = p_has_priority
  WHERE id = p_player_id AND active = true;
  
  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'admin_set_global_priority', 'player', p_player_id, 
          jsonb_build_object('has_global_priority', p_has_priority));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_group_priorities(
  p_group_id uuid, 
  p_search text DEFAULT NULL::text,
  p_admin_user_id uuid DEFAULT NULL::uuid
) RETURNS TABLE(player_id uuid, name text, phone_normalized text, avatar_path text, has_priority boolean) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := coalesce(p_admin_user_id, auth.uid());
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
  SELECT p.id as player_id, p.name, p.phone_normalized, p.avatar_path, pg.has_priority
  FROM public.players p
  JOIN public.player_groups pg ON p.id = pg.player_id
  WHERE pg.group_id = p_group_id AND pg.status = 'approved' AND p.active = true
    AND (p_search IS NULL OR p.name ILIKE '%' || p_search || '%' OR p.phone_normalized ILIKE '%' || p_search || '%')
  ORDER BY p.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_player_priority(
  p_player_id uuid, 
  p_group_id uuid, 
  p_has_priority boolean,
  p_admin_user_id uuid DEFAULT NULL::uuid
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := coalesce(p_admin_user_id, auth.uid());
BEGIN
  IF v_uid IS NULL OR NOT public.has_role(v_uid, 'admin') THEN RAISE EXCEPTION 'not_authorized'; END IF;
  UPDATE public.player_groups SET has_priority = p_has_priority
  WHERE player_id = p_player_id AND group_id = p_group_id AND status = 'approved';
  
  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_uid, 'admin_set_player_priority', 'player_group', p_player_id, 
          jsonb_build_object('group_id', p_group_id, 'has_priority', p_has_priority));
END;
$$;
