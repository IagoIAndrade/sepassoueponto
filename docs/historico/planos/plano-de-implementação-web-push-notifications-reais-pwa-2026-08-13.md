# Plano de Implementação: Web Push Notifications Reais (PWA)

Implementar sistema de notificações push server-side para avisar jogadores sobre promoções da fila de espera, garantindo funcionamento com PWA fechado e integração profunda com a arquitetura atual.

## User Review Required

> [!IMPORTANT]
> A implementação requer que as chaves VAPID (`VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY`) estejam configuradas no Lovable Cloud. Já identifiquei que as variáveis estão presentes no ambiente.

## Etapas de Implementação

### 1. Backend e Banco de Dados (Hardening & Outbox)
- **Migration Incremental**:
  - Criar tabela `push_notification_outbox` para garantir atonicidade e retries.
  - Criar tabela `push_deliveries` para controle multi-dispositivo.
  - Adicionar índices de performance e RLS rigoroso em `push_subscriptions`.
  - Refatorar `trigger_push_notification()` para inserir na outbox em vez de disparar HTTP direto (evitando timeouts e bloqueios).
  - Criar um job (via `pg_cron` ou RPC processada) para limpar outbox e gerenciar retries.

### 2. Service Worker (Deep Linking & UX)
- **Atualizar `public/sw-push.js`**:
  - Melhorar tratamento de `notificationclick` para suportar URLs complexas.
  - Garantir que ícones e badges sejam carregados corretamente do PWA.
  - Implementar lógica de foco de janela para evitar abrir múltiplas abas.

### 3. Frontend (UX Contextual & Gestão)
- **Home (`src/routes/index.tsx`)**:
  - Adicionar card contextual "🔔 Receba avisos importantes" para usuários logados sem push ativo.
  - Implementar lógica de feature detection robusta (iOS/Android).
- **Componente de Perfil**:
  - Adicionar seção "NOTIFICAÇÕES" com toggle por dispositivo.
- **Deep Link Handler**:
  - Ajustar o roteador para processar parâmetros de URL vindos do push e forçar a aba correta.

### 4. Integração de Promoção
- **RPC `internal_leave_registration_v2`**:
  - Garantir que a notificação interna `promoted_to_main` seja a única fonte de verdade para a criação do registro na outbox de push.

## Detalhes Técnicos

```text
Outbox Flow:
[DB Trigger] -> [push_notification_outbox]
[Cron/Trigger] -> [TanStack Start API] -> [Web Push API] -> [Device]
```

- **Idempotência**: Garantida por `notification_id` + `subscription_id` na tabela `push_deliveries`.
- **Segurança**: Chave privada VAPID nunca exposta ao cliente.
- **Roteamento**: Deep links usarão a estrutura `/?group=...&event=...&view=list`.

## Critérios de Aceite
- Notificação recebida com PWA fechado no Android/iOS (compatíveis).
- Clique na notificação abre o app no evento certo.
- Nenhuma duplicidade de envio.
- Falhas de rede do serviço de push não afetam a promoção do jogador no banco.
