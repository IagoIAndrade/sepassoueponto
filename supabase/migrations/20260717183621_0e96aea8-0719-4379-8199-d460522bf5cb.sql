
CREATE OR REPLACE FUNCTION public.internal_update_player_name(
  p_player_id uuid,
  p_new_name text
)
RETURNS TABLE(player_id uuid, name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean text;
  v_current public.players;
  v_new_norm text;
BEGIN
  IF p_player_id IS NULL THEN
    RAISE EXCEPTION 'invalid_player';
  END IF;
  IF p_new_name IS NULL THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;

  -- trim + colapsa espaços múltiplos + remove caracteres de controle
  v_clean := regexp_replace(btrim(p_new_name), '\s+', ' ', 'g');
  v_clean := regexp_replace(v_clean, '[[:cntrl:]]', '', 'g');

  IF length(v_clean) < 3 THEN
    RAISE EXCEPTION 'invalid_name';
  END IF;
  IF length(v_clean) > 80 THEN
    RAISE EXCEPTION 'name_too_long';
  END IF;

  SELECT * INTO v_current FROM public.players WHERE id = p_player_id;
  IF v_current.id IS NULL THEN
    RAISE EXCEPTION 'player_not_found';
  END IF;
  IF NOT v_current.active THEN
    RAISE EXCEPTION 'player_inactive';
  END IF;

  v_new_norm := lower(v_clean);
  IF v_new_norm = v_current.name_normalized THEN
    RAISE EXCEPTION 'name_unchanged';
  END IF;

  UPDATE public.players
     SET name = v_clean
   WHERE id = p_player_id;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (NULL, 'player_name_updated_by_self', 'player', p_player_id,
          jsonb_build_object('old_name', v_current.name, 'new_name', v_clean));

  player_id := p_player_id;
  name := v_clean;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_update_player_name(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.internal_update_player_name(uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.internal_update_player_name(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.internal_update_player_name(uuid, text) TO service_role;
