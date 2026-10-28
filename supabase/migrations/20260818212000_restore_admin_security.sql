CREATE OR REPLACE FUNCTION public.admin_remove_registration_v3(
  p_registration_id uuid,
  p_admin_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reg record;
  v_is_admin boolean;
BEGIN
  -- Restaurar verificação de administrador
  SELECT public.has_role(p_admin_user_id, 'admin') INTO v_is_admin;
  
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration_not_found';
  END IF;

  UPDATE public.registrations
  SET 
    cancelled_at = now(),
    position_number = NULL
  WHERE id = p_registration_id;

  IF v_reg.list_type = 'main'::public.list_type THEN
    PERFORM public.internal_promote_next_waiter(v_reg.event_id);
  END IF;
  
  -- Log de auditoria
  INSERT INTO public.admin_audit_logs (admin_id, action, target_id, details)
  VALUES (p_admin_user_id, 'remove_player', p_registration_id, 
          jsonb_build_object('event_id', v_reg.event_id, 'player_id', v_reg.player_id));
END;
$$;
