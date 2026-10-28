
-- 1) Campos de desativação em players
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS disabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_by uuid,
  ADD COLUMN IF NOT EXISTS disabled_reason text;

-- 2) Desativar cadastro
CREATE OR REPLACE FUNCTION public.admin_deactivate_player(
  p_player_id uuid,
  p_reason text,
  p_admin_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := coalesce(p_admin_user_id, auth.uid());
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.players WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'player_not_found';
  END IF;

  UPDATE public.players
     SET active = false,
         disabled_at = COALESCE(disabled_at, now()),
         disabled_by = v_admin,
         disabled_reason = NULLIF(btrim(coalesce(p_reason,'')), '')
   WHERE id = p_player_id;

  -- Revoga sessões ativas para impedir novo uso
  UPDATE public.player_sessions
     SET revoked_at = now()
   WHERE player_id = p_player_id AND revoked_at IS NULL;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_admin, 'admin_deactivate_player', 'player', p_player_id,
          jsonb_build_object('reason', p_reason));
END;
$$;

-- 3) Reativar cadastro
CREATE OR REPLACE FUNCTION public.admin_reactivate_player(
  p_player_id uuid,
  p_admin_user_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := coalesce(p_admin_user_id, auth.uid());
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  UPDATE public.players
     SET active = true,
         disabled_at = NULL,
         disabled_by = NULL,
         disabled_reason = NULL
   WHERE id = p_player_id;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_admin, 'admin_reactivate_player', 'player', p_player_id, '{}'::jsonb);
END;
$$;

-- 4) Excluir permanentemente (com validação completa)
CREATE OR REPLACE FUNCTION public.admin_delete_player(
  p_player_id uuid,
  p_admin_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin  uuid := coalesce(p_admin_user_id, auth.uid());
  v_name   text;
  v_regs   int;
  v_third  int;
  v_blocks int;
  v_teams  int;
BEGIN
  IF v_admin IS NULL OR NOT public.has_role(v_admin, 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT name INTO v_name FROM public.players WHERE id = p_player_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'player_not_found';
  END IF;

  SELECT count(*) INTO v_regs   FROM public.registrations WHERE player_id = p_player_id;
  SELECT count(*) INTO v_third  FROM public.registrations
    WHERE registered_by_player_id = p_player_id AND player_id <> p_player_id;
  SELECT count(*) INTO v_blocks FROM public.player_blocks WHERE player_id = p_player_id;
  SELECT count(*) INTO v_teams  FROM public.team_members tm
    JOIN public.registrations r ON r.id = tm.registration_id
    WHERE r.player_id = p_player_id;

  IF v_regs > 0 OR v_third > 0 OR v_blocks > 0 OR v_teams > 0 THEN
    RAISE EXCEPTION 'player_has_history';
  END IF;

  -- Limpa referências residuais que usam ON DELETE SET NULL
  UPDATE public.registrations
     SET cancelled_by_player_id = NULL
   WHERE cancelled_by_player_id = p_player_id;

  -- Remove sessões (cascadeia por FK, mas explicitar é seguro)
  DELETE FROM public.player_sessions WHERE player_id = p_player_id;
  -- Remove tentativas/histórico atrelados por phone (sem FK, mas mantidos)

  DELETE FROM public.players WHERE id = p_player_id;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (v_admin, 'admin_delete_player', 'player', p_player_id,
          jsonb_build_object('name', v_name));

  RETURN jsonb_build_object('deleted_id', p_player_id, 'name', v_name);
END;
$$;
