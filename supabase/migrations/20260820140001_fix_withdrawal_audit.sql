-- 1. Alterar a tabela registration_withdrawals para suportar múltiplos tipos de autores
ALTER TABLE public.registration_withdrawals 
DROP CONSTRAINT IF EXISTS registration_withdrawals_removed_by_id_fkey,
DROP CONSTRAINT IF EXISTS registration_withdrawals_removal_source_check;

-- Adicionar colunas específicas para cada domínio
ALTER TABLE public.registration_withdrawals 
ADD COLUMN IF NOT EXISTS removed_by_player_id uuid REFERENCES public.players(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS removed_by_admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Migrar dados existentes de removed_by_id para as colunas novas baseadas no removal_source
DO $$ 
BEGIN
    -- Migrar o que for possível
    UPDATE public.registration_withdrawals
    SET removed_by_player_id = CASE WHEN removal_source = 'player' THEN removed_by_id END,
        removed_by_admin_user_id = CASE WHEN removal_source = 'admin' THEN removed_by_id END
    WHERE removed_by_id IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
    -- Se falhar a FK, apenas limpamos e deixamos como 'system' ou autor nulo no histórico
    UPDATE public.registration_withdrawals SET removal_source = 'system' WHERE removed_by_id IS NOT NULL;
END $$;

-- Remover a coluna antiga
ALTER TABLE public.registration_withdrawals DROP COLUMN IF EXISTS removed_by_id;

-- Atualizar constraint de check
ALTER TABLE public.registration_withdrawals 
ADD CONSTRAINT registration_withdrawals_removal_source_check 
CHECK (removal_source IN ('player', 'admin', 'system'));

-- 2. Atualizar a função de trigger para suportar o novo modelo
CREATE OR REPLACE FUNCTION public.fn_log_registration_withdrawal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
    v_event_date date;
    v_group_id uuid;
    v_player_name text;
    v_deadline_time time;
    v_deadline_status text;
    v_removal_source text;
    v_admin_user_id uuid;
    v_player_actor_id uuid;
BEGIN
    -- Só age no cancelamento
    IF (OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL) THEN
        
        -- Obter info do evento e grupo
        SELECT event_date, group_id INTO v_event_date, v_group_id
        FROM public.volleyball_events
        WHERE id = NEW.event_id;

        -- Obter nome do jogador retirado
        SELECT name INTO v_player_name
        FROM public.players
        WHERE id = NEW.player_id;

        -- Obter settings do grupo
        SELECT withdrawal_deadline_time
        INTO v_deadline_time
        FROM public.app_settings
        WHERE group_id = v_group_id;

        -- LÓGICA DE IDENTIFICAÇÃO DO AUTOR
        -- Se vier do Admin (RPC admin_remove_registration_v3), NEW.cancelled_by_player_id contém auth.users.id
        -- Se vier do Jogador (RPC internal_leave_registration_v3), NEW.cancelled_by_player_id contém players.id
        
        IF NEW.cancelled_by_player_id IS NULL THEN
            v_removal_source := 'system';
        ELSE
            -- Tenta identificar se é um Admin (Supabase Auth)
            SELECT id INTO v_admin_user_id FROM auth.users WHERE id = NEW.cancelled_by_player_id;
            
            IF v_admin_user_id IS NOT NULL THEN
                v_removal_source := 'admin';
            ELSE
                -- Tenta identificar se é o próprio jogador ou outro jogador
                SELECT id INTO v_player_actor_id FROM public.players WHERE id = NEW.cancelled_by_player_id;
                
                IF v_player_actor_id IS NOT NULL THEN
                    v_removal_source := 'player';
                ELSE
                    -- Se não achou em nenhum lugar, marca como sistema/desconhecido
                    v_removal_source := 'system';
                END IF;
            END IF;
        END IF;

        -- Determinar status do prazo
        IF now() > (v_event_date + COALESCE(v_deadline_time, '10:00:00'::time)) THEN
            v_deadline_status := 'late';
        ELSE
            v_deadline_status := 'in_time';
        END IF;

        INSERT INTO public.registration_withdrawals (
            event_id,
            group_id,
            registration_id,
            player_id,
            player_name_snapshot,
            removed_at,
            removed_by_player_id,
            removed_by_admin_user_id,
            removal_source,
            deadline_status,
            list_type_snapshot,
            metadata
        ) VALUES (
            NEW.event_id,
            v_group_id,
            NEW.id,
            NEW.player_id,
            COALESCE(v_player_name, 'Desconhecido'),
            NEW.cancelled_at,
            v_player_actor_id,
            v_admin_user_id,
            v_removal_source,
            v_deadline_status,
            NEW.list_type,
            jsonb_build_object(
                'position_number', NEW.position_number,
                'created_at', NEW.created_at,
                'actor_id_original', NEW.cancelled_by_player_id
            )
        );
    END IF;
    RETURN NEW;
END;
$func$;

-- 3. Grants
GRANT SELECT ON public.registration_withdrawals TO authenticated;
GRANT ALL ON public.registration_withdrawals TO service_role;
