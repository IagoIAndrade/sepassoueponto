-- Lote R5 — fechamento corretivo definitivo (ACL de get_my_fund_status).
--
-- get_my_fund_status(text) é SECURITY DEFINER, recebe um token opaco de sessão
-- e devolve dados financeiros individuais. Deve permanecer restrita ao fluxo
-- server-side (service_role via cookie HttpOnly). GRANTs anteriores para
-- anon/authenticated foram herdados por CREATE OR REPLACE e precisam ser
-- explicitamente revogados.
--
-- Vocabulário: pg_get_functiondef confirmou que
-- internal_fund_participant_status, get_public_fund_player_statuses e
-- get_my_fund_status já retornam SOMENTE os sete códigos canônicos em inglês
-- (not_participating, exempt, to_define, pending, partial, in_full, overpaid).
-- Nenhuma correção de vocabulário é necessária.

REVOKE EXECUTE ON FUNCTION public.get_my_fund_status(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_my_fund_status(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_fund_status(text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_fund_status(text) TO service_role;
