-- 1. Criar a tabela de turmas (groups)
CREATE TABLE public.groups (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text UNIQUE NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL
);

GRANT SELECT ON public.groups TO anon, authenticated;
GRANT ALL ON public.groups TO service_role;

-- 2. Inserir turmas base
INSERT INTO public.groups (slug, name, sort_order) VALUES
('terca', 'Terça', 1),
('quarta', 'Quarta', 2),
('quinta', 'Quinta', 3);

-- 3. Adicionar colunas de grupo em tabelas existentes
ALTER TABLE public.app_settings ADD COLUMN group_id uuid REFERENCES public.groups(id);
ALTER TABLE public.volleyball_events ADD COLUMN group_id uuid REFERENCES public.groups(id);
ALTER TABLE public.player_incidents ADD COLUMN group_id uuid REFERENCES public.groups(id);
ALTER TABLE public.player_blocks ADD COLUMN group_id uuid REFERENCES public.groups(id);

-- 4. Backfill para a turma de 'quarta' (slug base)
DO $$
DECLARE
    v_quarta_id uuid;
BEGIN
    SELECT id INTO v_quarta_id FROM public.groups WHERE slug = 'quarta';
    
    UPDATE public.app_settings SET group_id = v_quarta_id WHERE group_id IS NULL;
    UPDATE public.volleyball_events SET group_id = v_quarta_id WHERE group_id IS NULL;
    UPDATE public.player_incidents SET group_id = v_quarta_id WHERE group_id IS NULL;
    UPDATE public.player_blocks SET group_id = v_quarta_id WHERE group_id IS NULL;
END $$;

-- 5. Configurar app_settings para as novas turmas (terça e quinta) a partir da base (quarta)
DO $$
DECLARE
    v_base_settings RECORD;
    v_terca_id uuid;
    v_quinta_id uuid;
BEGIN
    SELECT * INTO v_base_settings FROM public.app_settings LIMIT 1;
    SELECT id INTO v_terca_id FROM public.groups WHERE slug = 'terca';
    SELECT id INTO v_quinta_id FROM public.groups WHERE slug = 'quinta';

    -- Se existirem configurações base, clona para as outras
    IF v_base_settings.id IS NOT NULL THEN
        INSERT INTO public.app_settings (
            group_id, name, event_weekday, open_weekday, open_time, priority_minutes,
            deadline_weekday, deadline_time, max_players, main_limit, max_waitlist,
            access_restriction_active, auto_promote, auto_generate_incidents,
            announcement, event_name, location
        ) VALUES
        (
            v_terca_id, 'Vôlei Terça', 2, 0, v_base_settings.open_time, v_base_settings.priority_minutes,
            v_base_settings.deadline_weekday, v_base_settings.deadline_time, v_base_settings.max_players, 
            v_base_settings.main_limit, v_base_settings.max_waitlist,
            v_base_settings.access_restriction_active, v_base_settings.auto_promote, 
            v_base_settings.auto_generate_incidents, v_base_settings.announcement, 
            v_base_settings.event_name, v_base_settings.location
        ),
        (
            v_quinta_id, 'Vôlei Quinta', 4, 2, v_base_settings.open_time, v_base_settings.priority_minutes,
            v_base_settings.deadline_weekday, v_base_settings.deadline_time, v_base_settings.max_players, 
            v_base_settings.main_limit, v_base_settings.max_waitlist,
            v_base_settings.access_restriction_active, v_base_settings.auto_promote, 
            v_base_settings.auto_generate_incidents, v_base_settings.announcement, 
            v_base_settings.event_name, v_base_settings.location
        );
    END IF;
END $$;

-- 6. Tabela de vínculos Jogador <-> Turma (player_groups)
CREATE TABLE public.player_groups (
    player_id uuid REFERENCES public.players(id) ON DELETE CASCADE,
    group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
    status public.app_role DEFAULT 'user', -- reaproveitando enum se existir ou usando texto
    is_organizer boolean DEFAULT false NOT NULL,
    requested_at timestamptz DEFAULT now() NOT NULL,
    processed_at timestamptz,
    rejection_reason text,
    PRIMARY KEY (player_id, group_id)
);

-- Garantir tipo app_role compatível ou converter status para texto se necessário
-- Como já existe enum 'app_role' ('admin', 'moderator', 'user'), vamos usar texto para status de acesso
ALTER TABLE public.player_groups ALTER COLUMN status TYPE text;
ALTER TABLE public.player_groups ALTER COLUMN status SET DEFAULT 'approved';

GRANT SELECT, INSERT, UPDATE ON public.player_groups TO authenticated;
GRANT ALL ON public.player_groups TO service_role;

-- 7. Backfill de jogadores atuais para a turma de quarta
INSERT INTO public.player_groups (player_id, group_id, status)
SELECT id, (SELECT id FROM public.groups WHERE slug = 'quarta'), 'approved'
FROM public.players;

-- 8. Rateio multi-turma
ALTER TABLE public.equipment_funds ADD COLUMN scope text DEFAULT 'global' CHECK (scope IN ('global', 'group'));
ALTER TABLE public.equipment_funds ADD COLUMN group_id uuid REFERENCES public.groups(id);

CREATE TABLE public.fund_groups (
    fund_id uuid REFERENCES public.equipment_funds(id) ON DELETE CASCADE,
    group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE,
    PRIMARY KEY (fund_id, group_id)
);

GRANT SELECT ON public.fund_groups TO authenticated;
GRANT ALL ON public.fund_groups TO service_role;

-- 9. Ajuste nas Unique Constraints
ALTER TABLE public.volleyball_events ADD CONSTRAINT volleyball_events_group_date_unique UNIQUE (group_id, event_date);

-- 10. Atualização de RLS (opcional se as RPCs usarem security definer)
ALTER TABLE public.player_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Players can view their own groups" ON public.player_groups FOR SELECT USING (player_id = auth.uid());
CREATE POLICY "Admins can view all player groups" ON public.player_groups FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

