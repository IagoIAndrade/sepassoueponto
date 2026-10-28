-- Investigar se 'waiting' é um valor default em alguma coluna de sistema ou se existe um domain.

ALTER TABLE public.registrations ALTER COLUMN list_type DROP DEFAULT;
ALTER TABLE public.registrations ALTER COLUMN list_type SET DEFAULT 'wait'::public.list_type;

-- Recriar a RPC com um nome novo para evitar cache de plano de execução (se houver)
CREATE OR REPLACE FUNCTION public.admin_remove_v4(
  p_registration_id uuid,
  p_admin_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.registrations SET cancelled_at = now() WHERE id = p_registration_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
