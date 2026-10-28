-- 1. Buscar TODAS as funções que contêm 'waiting' e substituí-las.
-- Já fizemos isso em partes, mas vamos ser exaustivos nas funções de notificação que falharam no log anterior.

CREATE OR REPLACE FUNCTION public.fn_notify_promotion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_player_id UUID;
    v_event_id UUID;
    v_event_name TEXT;
    v_group_id UUID;
    v_group_slug TEXT;
    v_event_date DATE;
BEGIN
    -- Corrigido de 'waiting' para 'wait'
    IF (NEW.list_type = 'main' AND (OLD.list_type IS NULL OR OLD.list_type = 'wait' OR OLD.cancelled_at IS NOT NULL) AND NEW.cancelled_at IS NULL) THEN
        
        SELECT g.name, g.slug, e.group_id, e.event_date INTO v_event_name, v_group_slug, v_group_id, v_event_date
        FROM public.volleyball_events e
        JOIN public.groups g ON g.id = e.group_id
        WHERE e.id = NEW.event_id;

        INSERT INTO public.push_notification_outbox (
            player_id,
            title,
            body,
            data
        )
        VALUES (
            NEW.player_id,
            'Você entrou na lista!',
            'Sua inscrição na rodada de ' || v_event_name || ' foi confirmada.',
            jsonb_build_object(
                'url', '/event/' || v_group_slug || '/' || v_event_id
            )
        );
    END IF;
    RETURN NEW;
END;
$$;

-- 2. Garantir que o enum list_type não tenha 'waiting' e que nada aponte para ele.
-- Se o erro 22P02 persiste, é porque algo está tentando INSERIR 'waiting'.

-- 3. Refatorar admin_remove_registration_v3 para ser ULTRA seguro.
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
  v_admin_role public.app_role;
BEGIN
  -- Check admin
  SELECT role INTO v_admin_role FROM public.user_roles WHERE user_id = p_admin_user_id AND role = 'admin';
  IF v_admin_role IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_reg FROM public.registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Atomic update to cancelled_at
  UPDATE public.registrations
  SET 
    cancelled_at = now(),
    position_number = NULL -- Important to free up position
  WHERE id = p_registration_id;

  -- If it was a main list player, promote the next one
  IF v_reg.list_type = 'main'::public.list_type AND v_reg.cancelled_at IS NULL THEN
    PERFORM public.internal_promote_next_waiter(v_reg.event_id);
  END IF;

  -- Log action
  INSERT INTO public.admin_audit_logs (admin_id, action, target_id, details)
  VALUES (p_admin_user_id, 'remove_player', p_registration_id, 
          jsonb_build_object('event_id', v_reg.event_id, 'player_id', v_reg.player_id));
END;
$$;

-- 4. Unificar internal_promote_next_waiter
CREATE OR REPLACE FUNCTION public.internal_promote_next_waiter(p_event_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_waiter record;
BEGIN
  -- Find next in waitlist (ordered by created_at)
  -- CORREÇÃO: Usar 'wait' explicitamente com cast
  SELECT * INTO v_next_waiter
  FROM public.registrations
  WHERE event_id = p_event_id
    AND list_type = 'wait'::public.list_type
    AND cancelled_at IS NULL
  ORDER BY created_at ASC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.registrations
    SET 
      list_type = 'main'::public.list_type,
      position_number = (
        SELECT COALESCE(MAX(position_number), 0) + 1
        FROM public.registrations
        WHERE event_id = p_event_id 
          AND list_type = 'main'::public.list_type 
          AND cancelled_at IS NULL
      )
    WHERE id = v_next_waiter.id;
  END IF;
END;
$$;
