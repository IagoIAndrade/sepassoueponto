UPDATE public.volleyball_events
SET status = 'completed'
WHERE status NOT IN ('completed', 'cancelled')
  AND event_date < (CURRENT_DATE AT TIME ZONE 'America/Sao_Paulo')::date;