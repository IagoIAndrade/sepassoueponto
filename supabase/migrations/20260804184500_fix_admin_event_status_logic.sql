-- Atualiza a função admin_set_event_status para garantir que não haja erros de parâmetro ou falta de GRANT
CREATE OR REPLACE FUNCTION public.admin_set_event_status(
    p_event_id uuid, 
    p_status event_status, 
    p_manual_override boolean, 
    p_admin_user_id uuid
)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path TO 'public','pg_temp' 
AS $$
DECLARE
  v_gid uuid; 
  v_default_priority int; 
  v_effective_opens_at timestamptz; 
  v_effective_priority int;
BEGIN
  -- Verificar se o usuário é admin (mesmo sendo SECURITY DEFINER, validamos o v_admin_user_id ou auth.uid())
  IF NOT public.has_role(p_admin_user_id, 'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT group_id INTO v_gid FROM public.volleyball_events WHERE id = p_event_id;
  IF v_gid IS NULL THEN RAISE EXCEPTION 'event_not_found'; END IF;

  SELECT COALESCE(priority_minutes, 0) INTO v_default_priority FROM public.app_settings WHERE group_id = v_gid;

  v_effective_priority := COALESCE(v_default_priority, 0);
  v_effective_opens_at := now();

  UPDATE public.volleyball_events
     SET status = p_status,
         manual_override = p_manual_override,
         opens_at = CASE WHEN p_status = 'open' THEN v_effective_opens_at ELSE opens_at END,
         priority_minutes = CASE WHEN p_status = 'open' THEN v_effective_priority ELSE priority_minutes END
   WHERE id = p_event_id;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (p_admin_user_id, 'admin_set_event_status', 'event', p_event_id,
    jsonb_build_object('status', p_status, 'manual_override', p_manual_override, 'group_id', v_gid));
END; $$;

-- Importante: Garantir que authenticated pode chamar, mas a função valida o cargo
GRANT EXECUTE ON FUNCTION public.admin_set_event_status(uuid, public.event_status, boolean, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_event_status(uuid, public.event_status, boolean, uuid) TO service_role;
