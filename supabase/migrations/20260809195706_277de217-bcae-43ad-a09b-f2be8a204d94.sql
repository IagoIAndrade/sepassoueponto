CREATE TABLE public.push_subscriptions (
    id uuid primary key default gen_random_uuid(),
    player_id uuid references public.players(id) on delete cascade not null,
    endpoint text not null,
    p256dh text not null,
    auth text not null,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now(),
    last_success_at timestamp with time zone,
    failure_count integer default 0,
    user_agent text,
    unique (endpoint)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own subscriptions"
    ON public.push_subscriptions
    FOR ALL
    TO authenticated
    USING (player_id = auth.uid())
    WITH CHECK (player_id = auth.uid());
