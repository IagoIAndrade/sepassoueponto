
REVOKE ALL ON public.equipment_funds         FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.fund_participants       FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.fund_participant_players FROM anon, authenticated, PUBLIC;
REVOKE ALL ON public.fund_payments           FROM anon, authenticated, PUBLIC;

-- Garante que service_role continua com acesso total (já concedido no R1, reforça idempotência)
GRANT ALL ON public.equipment_funds         TO service_role;
GRANT ALL ON public.fund_participants       TO service_role;
GRANT ALL ON public.fund_participant_players TO service_role;
GRANT ALL ON public.fund_payments           TO service_role;
