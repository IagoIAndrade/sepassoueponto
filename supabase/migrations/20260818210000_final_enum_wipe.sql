-- 1. Forçar a remoção de qualquer trigger que ainda possa estar usando a lógica antiga
DROP TRIGGER IF EXISTS tr_notify_promotion ON public.registrations;
DROP TRIGGER IF EXISTS volleyball_registrations_promotion_trigger ON public.registrations;
DROP TRIGGER IF EXISTS tr_sync_organizers_opening ON public.registrations;

-- 2. Recriar o enum se necessário ou garantir que ele tenha 'wait'
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON t.typnamespace = n.oid WHERE t.typname = 'list_type' AND n.nspname = 'public') THEN
        CREATE TYPE public.list_type AS ENUM ('main', 'wait');
    END IF;
END $$;

-- 3. Atualizar a tabela registrations para garantir que não existam valores 'waiting' persistidos
-- (Caso o enum tenha sido alterado para incluir 'waiting' temporariamente, vamos limpá-lo)
UPDATE public.registrations SET list_type = 'wait'::public.list_type WHERE list_type::text = 'waiting';

-- 4. Refatorar a função de promoção para ser imune a erros de cast
CREATE OR REPLACE FUNCTION public.internal_promote_next_waiter(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_waiter_id uuid;
  v_next_pos int;
BEGIN
  -- Encontrar o próximo ID da reserva de forma segura
  SELECT id INTO v_next_waiter_id
  FROM public.registrations
  WHERE event_id = p_event_id
    AND list_type = 'wait'::public.list_type
    AND cancelled_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_next_waiter_id IS NOT NULL THEN
    -- Calcular próxima posição
    SELECT COALESCE(MAX(position_number), 0) + 1 INTO v_next_pos
    FROM public.registrations
    WHERE event_id = p_event_id 
      AND list_type = 'main'::public.list_type 
      AND cancelled_at IS NULL;

    UPDATE public.registrations
    SET 
      list_type = 'main'::public.list_type,
      position_number = v_next_pos
    WHERE id = v_next_waiter_id;
  END IF;
END;
$$;

-- 5. Garantir que admin_remove_registration_v3 seja a única fonte de verdade
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
BEGIN
  -- Auditoria básica (opcional, dependendo da tabela)
  SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration_not_found';
  END IF;

  -- Update atômico
  UPDATE public.registrations
  SET 
    cancelled_at = now(),
    position_number = NULL
  WHERE id = p_registration_id;

  -- Promoção automática se era da lista principal
  IF v_reg.list_type = 'main'::public.list_type THEN
    PERFORM public.internal_promote_next_waiter(v_reg.event_id);
  END IF;
END;
$$;
