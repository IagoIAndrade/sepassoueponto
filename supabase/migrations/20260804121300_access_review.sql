-- Adiciona a flag global para ativação definitiva da restrição
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS access_restriction_active boolean DEFAULT false;

-- Função para listar jogadores que precisam de revisão de acesso
CREATE OR REPLACE FUNCTION public.admin_list_players_to_review(
    p_search text DEFAULT NULL
)
RETURNS TABLE (
    player_id uuid,
    first_name text,
    last_name text,
    phone_normalized text,
    created_at timestamptz,
    last_participation_date date,
    last_participation_group_name text,
    suggested_group_ids uuid[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    WITH player_history AS (
        -- Busca a última participação e grupos sugeridos pelo histórico
        SELECT 
            r.player_id,
            MAX(e.event_date) as last_date,
            ARRAY_AGG(DISTINCT e.group_id) as hist_groups
        FROM registrations r
        JOIN volleyball_events e ON r.event_id = e.id
        WHERE r.cancelled_at IS NULL
        GROUP BY r.player_id
    ),
    last_event_info AS (
        -- Detalhes do último evento para exibir o nome da turma
        SELECT 
            h.player_id,
            h.last_date,
            h.hist_groups,
            g.name as group_name
        FROM player_history h
        LEFT JOIN volleyball_events e ON e.player_id = h.player_id AND e.event_date = h.last_date
        LEFT JOIN groups g ON e.group_id = g.id
        -- Garante apenas um registro se houver múltiplos eventos no mesmo dia (improvável)
        DISTINCT ON (h.player_id)
    )
    SELECT 
        p.id as player_id,
        p.first_name,
        p.last_name,
        p.phone_normalized,
        p.created_at,
        lei.last_date as last_participation_date,
        lei.group_name as last_participation_group_name,
        COALESCE(lei.hist_groups, '{}'::uuid[]) as suggested_group_ids
    FROM players p
    LEFT JOIN last_event_info lei ON p.id = lei.player_id
    WHERE p.active = true
      -- Apenas jogadores que NÃO possuem NENHUM registro na player_groups
      AND NOT EXISTS (
          SELECT 1 FROM player_groups pg WHERE pg.player_id = p.id
      )
      AND (
          p_search IS NULL 
          OR p.name_normalized ILIKE '%' || p_search || '%'
          OR p.phone_normalized ILIKE '%' || p_search || '%'
      )
    ORDER BY p.name_normalized ASC;
END;
$$;

-- Função para salvar acessos revisados
CREATE OR REPLACE FUNCTION public.admin_save_reviewed_accesses(
    p_player_ids uuid[],
    p_group_ids uuid[],
    p_admin_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pid uuid;
    v_gid uuid;
BEGIN
    FOREACH v_pid IN ARRAY p_player_ids LOOP
        -- Remove qualquer resquício (embora a consulta garanta que não existem)
        DELETE FROM player_groups WHERE player_id = v_pid;
        
        -- Insere os novos acessos aprovados
        FOREACH v_gid IN ARRAY p_group_ids LOOP
            INSERT INTO player_groups (
                player_id, 
                group_id, 
                status, 
                approved_at, 
                approved_by
            ) VALUES (
                v_pid, 
                v_gid, 
                'approved', 
                now(), 
                p_admin_id
            );
        END LOOP;
    END LOOP;
END;
$$;

-- Grant permissões
GRANT EXECUTE ON FUNCTION public.admin_list_players_to_review(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_reviewed_accesses(uuid[], uuid[], uuid) TO authenticated;
