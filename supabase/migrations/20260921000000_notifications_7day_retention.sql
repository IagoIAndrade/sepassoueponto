-- =====================================================================
-- MIGRAÇÃO: RETENÇÃO DE 7 DIAS NA CENTRAL DE AVISOS DO JOGADOR
-- Arquivo: 20260921000000_notifications_7day_retention.sql
-- Tabela auditada: public.notifications (campo created_at)
-- =====================================================================

-- 1. Função segura para limpar exclusivamente notificações antigas (> 7 dias)
CREATE OR REPLACE FUNCTION public.cleanup_old_player_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_deleted_count integer := 0;
BEGIN
  -- Exclui exclusivamente registros de notificações com idade superior a 7 dias
  DELETE FROM public.notifications
  WHERE created_at < (now() - interval '7 days');

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'deleted_notifications', v_deleted_count,
    'executed_at', now()
  );
END;
$$;

-- 2. Permissões de execução estritas
REVOKE ALL ON FUNCTION public.cleanup_old_player_notifications() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_old_player_notifications() FROM anon;
REVOKE ALL ON FUNCTION public.cleanup_old_player_notifications() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_player_notifications() TO service_role;

-- 3. Agendamento idempotente via pg_cron (execução diária às 04:00 UTC)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    BEGIN
      PERFORM cron.unschedule('player_notifications_cleanup_job');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    PERFORM cron.schedule(
      'player_notifications_cleanup_job',
      '0 4 * * *',
      'SELECT public.cleanup_old_player_notifications()'
    );
  END IF;
END;
$$;
