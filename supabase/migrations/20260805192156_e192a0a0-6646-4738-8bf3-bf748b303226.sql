
-- Garantir unicidade (caso não exista)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'player_groups_player_id_group_id_key') THEN
        ALTER TABLE public.player_groups ADD CONSTRAINT player_groups_player_id_group_id_key UNIQUE (player_id, group_id);
    END IF;
END $$;

-- Atualizar função de solicitação de acesso
CREATE OR REPLACE FUNCTION public.player_request_group_access(p_token text, p_group_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $$
 DECLARE v_player_id uuid; v_status player_group_status;
 BEGIN
     -- Validar sessão
     SELECT public.internal_validate_session(p_token) INTO v_player_id;
     IF v_player_id IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
     
     -- Verificar status atual
     SELECT status INTO v_status FROM public.player_groups WHERE player_id = v_player_id AND group_id = p_group_id;
     
     IF v_status = 'pending' THEN 
         RAISE EXCEPTION 'Já existe uma solicitação aguardando análise.';
     ELSIF v_status = 'approved' THEN 
         RAISE EXCEPTION 'Você já possui acesso a esta turma.';
     ELSIF v_status = 'rejected' THEN 
         RAISE EXCEPTION 'O acesso a esta turma não foi aprovado pela organização. Caso acredite que houve um engano, entre em contato via WhatsApp.';
     ELSIF v_status IS NOT NULL THEN 
         -- Resetar para pendente apenas se não estiver recusado/aprovado/pendente (ex: suspenso ou outro status manual)
         UPDATE public.player_groups 
         SET status = 'pending', 
             requested_at = now(), 
             processed_at = NULL, 
             processed_by = NULL,
             rejection_reason = NULL 
         WHERE player_id = v_player_id AND group_id = p_group_id;
     ELSE 
         -- Novo vínculo
         INSERT INTO public.player_groups (player_id, group_id, status) VALUES (v_player_id, p_group_id, 'pending'); 
     END IF;
 END;
$$;

-- Drop function to change return type
DROP FUNCTION IF EXISTS public.admin_list_pending_approvals(uuid, player_group_status, text);

-- Atualizar função de listagem administrativa para incluir o motivo da recusa
CREATE OR REPLACE FUNCTION public.admin_list_pending_approvals(
    p_group_id uuid DEFAULT NULL,
    p_status player_group_status DEFAULT 'pending',
    p_search text DEFAULT NULL
)
 RETURNS TABLE(
    player_id uuid,
    first_name text,
    last_name text,
    phone_normalized text,
    group_id uuid,
    group_name text,
    status player_group_status,
    requested_at timestamp with time zone,
    rejection_reason text
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id as player_id,
        p.first_name,
        p.last_name,
        p.phone_normalized,
        g.id as group_id,
        g.name as group_name,
        pg.status,
        pg.requested_at,
        pg.rejection_reason
    FROM 
        public.players p
    JOIN 
        public.player_groups pg ON p.id = pg.player_id
    JOIN 
        public.volleyball_groups g ON pg.group_id = g.id
    WHERE 
        (p_group_id IS NULL OR pg.group_id = p_group_id)
        AND (p_status = 'all'::player_group_status OR pg.status = p_status)
        AND (p_search IS NULL OR 
             p.first_name ILIKE '%' || p_search || '%' OR 
             p.last_name ILIKE '%' || p_search || '%' OR 
             p.phone_normalized ILIKE '%' || p_search || '%')
    ORDER BY 
        pg.requested_at DESC;
END;
$$;

GRANT ALL ON FUNCTION public.admin_list_pending_approvals(uuid, player_group_status, text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_list_pending_approvals(uuid, player_group_status, text) TO service_role;
