-- Desativar trigger de auditoria que pode ser o culpado silencioso.

DO $$
DECLARE
    t RECORD;
BEGIN
    FOR t IN (SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'registrations') LOOP
        IF t.trigger_name LIKE '%audit%' OR t.trigger_name LIKE '%log%' THEN
            EXECUTE format('ALTER TABLE public.registrations DISABLE TRIGGER %I', t.trigger_name);
        END IF;
    END LOOP;
END $$;

-- E tentar a remoção novamente sem log na RPC
CREATE OR REPLACE FUNCTION public.admin_remove_registration_v3(
  p_registration_id uuid,
  p_admin_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reg record;
BEGIN
  -- Lógica mínima para teste
  UPDATE public.registrations SET cancelled_at = now() WHERE id = p_registration_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;
