-- 1. Adicionar campos de organizador na tabela player_groups
ALTER TABLE public.player_groups 
ADD COLUMN IF NOT EXISTS is_organizer BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS organizer_order INTEGER;

-- 2. Grant de acesso
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_groups TO authenticated;
GRANT ALL ON public.player_groups TO service_role;

-- 3. Adicionar campo de controle na volleyball_events para evitar re-inclusão automática
ALTER TABLE public.volleyball_events
ADD COLUMN IF NOT EXISTS organizers_auto_enrolled_at TIMESTAMPTZ;

-- 4. Função para normalizar e garantir a unicidade da ordem dos organizadores por grupo
CREATE OR REPLACE FUNCTION public.check_organizer_order_uniqueness()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_organizer = TRUE AND NEW.organizer_order IS NOT NULL THEN
        IF EXISTS (
            SELECT 1 FROM public.player_groups 
            WHERE group_id = NEW.group_id 
              AND organizer_order = NEW.organizer_order 
              AND is_organizer = TRUE 
              AND id <> NEW.id
        ) THEN
            RAISE EXCEPTION 'Já existe um organizador com a ordem % nesta turma.', NEW.organizer_order;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_organizer_order ON public.player_groups;
CREATE TRIGGER trg_check_organizer_order
BEFORE INSERT OR UPDATE ON public.player_groups
FOR EACH ROW EXECUTE FUNCTION public.check_organizer_order_uniqueness();

-- 5. RPC para inclusão automática de organizadores
CREATE OR REPLACE FUNCTION public.admin_auto_enroll_organizers(p_event_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_event RECORD;
    v_settings RECORD;
    v_organizer RECORD;
    v_count INTEGER := 0;
    v_inserted_players JSONB := '[]'::jsonb;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- Obter detalhes do evento
    SELECT * INTO v_event FROM volleyball_events WHERE id = p_event_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'message', 'Evento não encontrado');
    END IF;

    -- Verificar se já foi executado
    IF v_event.organizers_auto_enrolled_at IS NOT NULL THEN
        RETURN jsonb_build_object('ok', true, 'message', 'Organizadores já foram incluídos anteriormente', 'count', 0);
    END IF;

    -- Buscar organizadores ativos e aprovados
    FOR v_organizer IN 
        SELECT pg.player_id, pg.organizer_order, p.name
        FROM player_groups pg
        JOIN players p ON p.id = pg.player_id
        WHERE pg.group_id = v_event.group_id 
          AND pg.is_organizer = TRUE 
          AND pg.status = 'approved'
          AND p.active = TRUE
        ORDER BY pg.organizer_order ASC
    LOOP
        -- Inserir se não estiver inscrito
        IF NOT EXISTS (SELECT 1 FROM registrations WHERE event_id = p_event_id AND player_id = v_organizer.player_id AND cancelled_at IS NULL) THEN
            
            INSERT INTO registrations (
                event_id, 
                player_id, 
                list_type, 
                position_number, 
                registered_by_player_id,
                created_at
            ) VALUES (
                p_event_id,
                v_organizer.player_id,
                'main',
                v_organizer.organizer_order,
                v_organizer.player_id,
                v_now
            );
            
            v_count := v_count + 1;
            v_inserted_players := v_inserted_players || jsonb_build_object('id', v_organizer.player_id, 'name', v_organizer.name, 'order', v_organizer.organizer_order);
        END IF;
    END LOOP;

    -- Marca como concluído
    UPDATE volleyball_events SET organizers_auto_enrolled_at = v_now WHERE id = p_event_id;
    
    RETURN jsonb_build_object(
        'ok', true, 
        'count', v_count, 
        'inserted', v_inserted_players
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_auto_enroll_organizers(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_auto_enroll_organizers(UUID) TO service_role;
