
-- ============================================================
-- LOTE R1.1 — Integridade e endurecimento
-- ============================================================

-- 1) UNIQUE (fund_id, id) em fund_participants para permitir FK composta
ALTER TABLE public.fund_participants
  ADD CONSTRAINT fund_participants_fund_id_id_key UNIQUE (fund_id, id);

-- 2) FK composta em fund_participant_players
ALTER TABLE public.fund_participant_players
  DROP CONSTRAINT fund_participant_players_participant_id_fkey;

ALTER TABLE public.fund_participant_players
  ADD CONSTRAINT fund_participant_players_participant_fkey
  FOREIGN KEY (fund_id, participant_id)
  REFERENCES public.fund_participants(fund_id, id)
  ON DELETE CASCADE;

-- 3) FK composta em fund_payments (RESTRICT bloqueia exclusão de participante com pagamentos)
ALTER TABLE public.fund_payments
  DROP CONSTRAINT fund_payments_participant_id_fkey;

ALTER TABLE public.fund_payments
  ADD CONSTRAINT fund_payments_participant_fkey
  FOREIGN KEY (fund_id, participant_id)
  REFERENCES public.fund_participants(fund_id, id)
  ON DELETE RESTRICT;

-- Índice específico para participante em pagamentos já existe (fund_payments_participant_idx);
-- criamos um novo composto para suportar a FK composta sem redundância nociva.
CREATE INDEX fund_payments_fund_participant_idx
  ON public.fund_payments(fund_id, participant_id)
  WHERE participant_id IS NOT NULL;

-- 4) Estado contraditório do participante: isento exige participates=true
ALTER TABLE public.fund_participants
  ADD CONSTRAINT fund_participants_exempt_requires_participates
  CHECK (NOT exempt OR participates);

-- 5) Endurecimento de search_path e ACL das funções

-- get_public_fund_summary: search_path mais restrito
ALTER FUNCTION public.get_public_fund_summary()
  SET search_path = pg_catalog, public;

-- get_my_fund_status: search_path restrito + revoga anon/authenticated.
-- Cliente NUNCA chama diretamente (cookie HttpOnly não é legível pelo browser).
-- Uma server function do TanStack lê o cookie e chama via service_role.
ALTER FUNCTION public.get_my_fund_status(text)
  SET search_path = pg_catalog, public;

REVOKE EXECUTE ON FUNCTION public.get_my_fund_status(text) FROM PUBLIC, anon, authenticated;
-- Mantém apenas para service_role (default do owner postgres já garante execução).
GRANT EXECUTE ON FUNCTION public.get_my_fund_status(text) TO service_role;
