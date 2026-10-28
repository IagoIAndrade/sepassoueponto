-- Alinhamento da função is_event_active com a definição de "rodada atual" do sistema.
-- Isso garante que apenas as inscrições da rodada que está sendo exibida no app sejam acessíveis via RLS.
-- Rodadas antigas que ficaram com status 'open' ou 'closed' deixam de ser consultáveis diretamente pelo browser.

CREATE OR REPLACE FUNCTION public.is_event_active(p_event_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $func$
DECLARE
  v_group_id uuid;
  v_current_id uuid;
BEGIN
  -- 1. Obter o group_id do evento
  SELECT group_id INTO v_group_id 
  FROM public.volleyball_events 
  WHERE id = p_event_id;

  IF v_group_id IS NULL THEN
    RETURN false;
  END IF;

  -- 2. Encontrar o evento "atual" para este grupo usando a lógica oficial do sistema
  -- Esta lógica deve ser idêntica à da RPC get_public_current_event.
  SELECT e.id INTO v_current_id
  FROM public.volleyball_events e
  LEFT JOIN public.app_settings s ON s.group_id = e.group_id
  WHERE e.group_id = v_group_id
    AND e.event_date >= (now() AT TIME ZONE COALESCE(s.timezone, 'America/Sao_Paulo'))::date
    AND e.status NOT IN ('completed', 'cancelled')
  ORDER BY e.event_date ASC
  LIMIT 1;

  -- 3. Retornar true se for o evento atual
  RETURN (p_event_id = v_current_id);
END;
$func$;

GRANT EXECUTE ON FUNCTION public.is_event_active(uuid) TO anon, authenticated;

COMMENT ON FUNCTION public.is_event_active(uuid) IS 'Determina se um evento é a rodada atual do seu grupo, restringindo o acesso público a dados históricos.';
