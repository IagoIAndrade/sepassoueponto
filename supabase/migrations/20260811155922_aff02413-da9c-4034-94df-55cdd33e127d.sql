-- Vulnerabilidade: A tabela 'registrations' possuía permissões 'ALL' para as roles 'anon' e 'authenticated',
-- permitindo que qualquer usuário pudesse ler, inserir, atualizar ou deletar registros diretamente.
-- Além disso, a política de SELECT era 'USING (true)', expondo todo o histórico do sistema e dados internos (quem inscreveu quem, etc).

-- 1. Remover privilégios excessivos (Reset Geral)
-- Note: Se psql falhar por falta de ownership, o Lovable Cloud aplica isso como superuser.
REVOKE ALL ON public.registrations FROM anon, authenticated, PUBLIC;

-- 2. Conceder apenas SELECT nas colunas não sensíveis para as roles de aplicação
-- Isso permite o funcionamento do Realtime na lista pública sem expor metadados internos (como 'registered_by_player_id').
GRANT SELECT (id, event_id, player_id, list_type, position_number, created_at, cancelled_at) 
ON public.registrations TO anon, authenticated;

-- 3. Função auxiliar para verificar se o evento é ativo (protege histórico)
-- Definida como SECURITY DEFINER para garantir que o check funcione independente do RLS da volleyball_events.
CREATE OR REPLACE FUNCTION public.is_event_active(p_event_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $func$
  SELECT EXISTS (
    SELECT 1 FROM public.volleyball_events
    WHERE id = p_event_id
    AND status IN ('scheduled', 'open', 'closed')
  );
$func$;

GRANT EXECUTE ON FUNCTION public.is_event_active(uuid) TO anon, authenticated;

-- 4. Reforçar a política de RLS para proteger o histórico
DROP POLICY IF EXISTS registrations_select_policy ON public.registrations;
CREATE POLICY registrations_select_policy ON public.registrations
FOR SELECT TO PUBLIC
USING (
  public.is_event_active(event_id)
);

-- 5. Garantir que as funções internas (Server Functions) continuem funcionando com Service Role
GRANT ALL ON public.registrations TO service_role;

COMMENT ON POLICY registrations_select_policy ON public.registrations IS 'Protege histórico e colunas internas, permitindo apenas leitura de eventos ativos para o frontend.';
