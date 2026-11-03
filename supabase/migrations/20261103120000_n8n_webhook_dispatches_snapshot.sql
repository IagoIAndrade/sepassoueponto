-- A tabela n8n_webhook_dispatches foi criada em alguns bancos com a versão
-- inicial da migration 20261028120000 (sem signature/snapshot). Sem essas
-- colunas o aviso de "lista completa" nunca é enviado.
ALTER TABLE public.n8n_webhook_dispatches
  ADD COLUMN IF NOT EXISTS signature text,
  ADD COLUMN IF NOT EXISTS snapshot jsonb NOT NULL DEFAULT '[]'::jsonb;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.n8n_webhook_dispatches TO service_role;
