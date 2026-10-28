-- Job para limpar notificações enviadas ou falhas antigas
CREATE OR REPLACE FUNCTION public.push_notifications_cleanup()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Remover registros 'sent' com mais de 7 dias
  DELETE FROM public.push_notification_outbox
  WHERE status = 'sent' AND sent_at < (now() - interval '7 days');

  -- Remover registros 'failed' com mais de 15 dias (para auditoria)
  DELETE FROM public.push_notification_outbox
  WHERE status = 'failed' AND failed_at < (now() - interval '15 days');
END;
$$;
