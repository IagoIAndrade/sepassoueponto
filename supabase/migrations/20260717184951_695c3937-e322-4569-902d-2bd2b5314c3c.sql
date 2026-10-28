CREATE OR REPLACE FUNCTION public.internal_update_player_name(p_player_id uuid, p_new_name text)
 RETURNS TABLE(player_id uuid, name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Alinhado com internal_signup_player: apenas btrim, mínimo 2, sem outras transformações
  v_clean := btrim(p_new_name);

  IF length(v_clean) < 2 THEN
    RAISE EXCEPTION 'invalid_name';
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
$function$;