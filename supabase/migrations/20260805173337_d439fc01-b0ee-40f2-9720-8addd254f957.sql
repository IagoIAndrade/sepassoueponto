CREATE OR REPLACE FUNCTION public.current_user_has_role(_role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = _role
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.current_user_has_role(public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(public.app_role) TO service_role;
