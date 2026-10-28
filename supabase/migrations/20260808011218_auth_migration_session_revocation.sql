-- Migração: Virada Global de Autenticação
-- Data: 2026-08-08
-- Objetivo: Revogar todas as sessões de jogadores ativas.

-- 1. Revogar todas as sessões de jogadores
UPDATE public.player_sessions 
SET revoked_at = now() 
WHERE revoked_at IS NULL;

-- 2. Adicionar marco temporal nas configurações para controle de bootstrap se necessário
-- (Já existe app_settings por grupo, mas a revogação acima é absoluta e suficiente para a internal_validate_session falhar)

