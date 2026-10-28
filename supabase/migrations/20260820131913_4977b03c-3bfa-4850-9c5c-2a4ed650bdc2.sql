-- Remover o job redundante para evitar concorrência desnecessária
SELECT cron.unschedule('round_cycling_job');
