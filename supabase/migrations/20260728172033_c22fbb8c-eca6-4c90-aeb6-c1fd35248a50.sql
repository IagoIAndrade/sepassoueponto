CREATE OR REPLACE FUNCTION public.admin_set_group_active(p_group_id uuid, p_active boolean)
RETURNS TABLE(id uuid, slug text, name text, active boolean, sort_order integer)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.groups g
     SET active = p_active,
         updated_at = now()
   WHERE g.id = p_group_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'group_not_found';
  END IF;

  INSERT INTO public.admin_actions_log (admin_user_id, action, target_type, target_id, details)
  VALUES (auth.uid(), CASE WHEN p_active THEN 'group_activate' ELSE 'group_deactivate' END,
          'group', p_group_id, jsonb_build_object('active', p_active));

  RETURN QUERY SELECT g.id, g.slug, g.name, g.active, g.sort_order
                 FROM public.groups g WHERE g.id = p_group_id;
END; $function$;

REVOKE ALL ON FUNCTION public.admin_set_group_active(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_group_active(uuid, boolean) TO authenticated;