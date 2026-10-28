-- 1. Criar Enum para tipos de notificação
CREATE TYPE public.notification_type AS ENUM (
    'registration_opened',
    'promoted_to_main',
    'teams_published',
    'event_changed',
    'event_cancelled',
    'organization_announcement',
    'withdrawal_deadline',
    'payment_pending'
);

-- 2. Criar tabela de notificações
CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    type public.notification_type NOT NULL,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    event_id UUID REFERENCES public.volleyball_events(id) ON DELETE CASCADE,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    read_at TIMESTAMPTZ,
    
    -- Mecanismo de idempotência (ex: uma notificação por jogador+rodada+tipo)
    -- Para alguns tipos como announcement, podemos usar metadados ou group_id
    idempotency_key TEXT
);

-- 3. Índices para performance e restrições
CREATE INDEX idx_notifications_player_id_read_at ON public.notifications (player_id, read_at);
CREATE INDEX idx_notifications_player_id_created_at ON public.notifications (player_id, created_at DESC);
CREATE UNIQUE INDEX idx_notifications_idempotency ON public.notifications (idempotency_key) WHERE idempotency_key IS NOT NULL;

-- 4. Habilitar RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- 5. Políticas de Segurança (IDOR PROTECTION)
CREATE POLICY "Jogadores podem ver suas próprias notificações"
ON public.notifications FOR SELECT
TO authenticated
USING (auth.uid() = player_id);

CREATE POLICY "Jogadores podem marcar suas notificações como lidas"
ON public.notifications FOR UPDATE
TO authenticated
USING (auth.uid() = player_id)
WITH CHECK (auth.uid() = player_id);

-- 6. Grants
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

-- 7. Habilitar Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
