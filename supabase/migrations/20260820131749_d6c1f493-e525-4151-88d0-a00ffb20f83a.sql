-- Corrigir Recursividade Infinita removendo a chamada mútua
CREATE OR REPLACE FUNCTION public.internal_cycle_rounds()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group record;
  v_event record;
  v_today date;
  v_closed_count int := 0;
  v_created_count int := 0;
  v_res jsonb;
BEGIN
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  -- A. ENCERRAMENTO (Reconciliação)
  FOR v_event IN
    SELECT id, event_date, status, group_id
    FROM public.volleyball_events
    WHERE event_date < v_today
      AND status IN ('scheduled', 'open', 'closed')
  LOOP
    UPDATE public.volleyball_events
    SET status = 'completed'
    WHERE id = v_event.id;
    
    INSERT INTO public.admin_actions_log (action, target_type, target_id, details)
    VALUES ('AUTO_ROUND_CLOSE', 'event', v_event.id, 
            jsonb_build_object('event_date', v_event.event_date, 'previous_status', v_event.status));
            
    v_closed_count := v_closed_count + 1;
  END LOOP;

  -- B. CRIAÇÃO AUTOMÁTICA
  FOR v_group IN
    SELECT id, name
    FROM public.groups
    ORDER BY sort_order
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.volleyball_events
      WHERE group_id = v_group.id
        AND event_date >= v_today
        AND status IN ('scheduled', 'open', 'closed')
    ) THEN
      v_res := public.internal_create_next_event(v_group.id);
      IF v_res->>'status' = 'created' THEN
        v_created_count := v_created_count + 1;
      END IF;
    END IF;
  END LOOP;

  -- REMOVIDO: PERFORM public.internal_process_due_event_openings(); 
  -- O job process_event_openings já chama cycle_rounds, 
  -- e depois cycle_rounds NÃO deve chamar process_event_openings.

  RETURN jsonb_build_object(
    'ok', true,
    'closed', v_closed_count,
    'created', v_created_count,
    'executed_at', now()
  );
END;
$$;
