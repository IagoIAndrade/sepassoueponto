-- Controle de disparos dos webhooks do n8n (mensagens no grupo do WhatsApp).
-- Guarda a última lista enviada por rodada: o aviso só é reenviado quando a
-- composição da lista principal muda (ex.: alguém saiu e o reserva subiu),
-- mesmo com inscrições simultâneas. Acesso apenas pelo servidor (service_role).
CREATE TABLE IF NOT EXISTS public.n8n_webhook_dispatches (
  event_id uuid NOT NULL REFERENCES public.volleyball_events(id) ON DELETE CASCADE,
  kind text NOT NULL,
  signature text,
  snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, kind)
);

ALTER TABLE public.n8n_webhook_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.n8n_webhook_dispatches FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.n8n_webhook_dispatches TO service_role;
