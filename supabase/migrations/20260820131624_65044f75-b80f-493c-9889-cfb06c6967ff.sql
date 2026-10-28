-- Injetar o ciclo de rodadas dentro do job existente que roda a cada minuto
CREATE OR REPLACE FUNCTION public.internal_process_due_event_openings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 1. Ciclo de Rodadas (Encerramento e Criação)
  PERFORM public.internal_cycle_rounds();

  -- 2. Processamento de Aberturas
  PERFORM public.internal_process_event_opening(id)
  FROM public.volleyball_events
  WHERE status = 'scheduled'
    AND opens_at <= now();
END;
$$;
