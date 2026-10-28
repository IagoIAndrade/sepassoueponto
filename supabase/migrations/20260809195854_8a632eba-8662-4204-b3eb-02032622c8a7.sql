CREATE EXTENSION IF NOT EXISTS "http" WITH SCHEMA "extensions";

CREATE OR REPLACE FUNCTION public.trigger_push_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Chamada assíncrona para a API do TanStack Start
  -- O endpoint /api/public/push-trigger processará o envio
  PERFORM
    extensions.http_post(
      'https://se-passou-e-ponto.lovable.app/api/public/push-trigger',
      jsonb_build_object(
        'type', 'INSERT',
        'record', row_to_json(NEW)
      )::text,
      'application/json'
    );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_notification_created_push ON public.notifications;
CREATE TRIGGER on_notification_created_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_push_notification();
