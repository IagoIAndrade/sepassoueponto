# Plano de Melhoria: Fluxo de Status, Fila e Notificações

Este plano visa unificar a lógica de status do jogador, implementar a promoção automática no backend com notificações integradas e garantir que a interface reflita esses estados de forma consistente em tempo real.

## Mudanças no Backend (PostgreSQL & RPCs)

### 1. Extensão do Enum de Notificações
Adicionar os tipos `registration_confirmed` e `waitlist_joined` ao enum `notification_type` para cobrir todos os estágios da inscrição.

### 2. Refatoração da Promoção Automática (`internal_leave_registration_v3`)
Atualmente a saída (`leave`) apenas cancela a inscrição. Vamos criar a versão `v3` que:
- Executa a saída do jogador.
- Se o jogador que saiu era da Lista Principal (`main`), busca o primeiro da fila de espera (`waitlist`) do mesmo evento.
- Promove o reserva para titular alterando seu `list_type` para `main` e atualizando `position_number`.
- Registra a promoção nos metadados da inscrição (ex: `promoted_at`).
- Todo o processo ocorre em uma única transação atômica.
- A notificação `promoted_to_main` será disparada pelo trigger existente `trg_notify_promotion`.

### 3. Notificações de Inscrição na `internal_join_event`
Atualizar a função de inscrição para criar notificações:
- Se entrou na lista principal: `registration_confirmed`.
- Se entrou na reserva: `waitlist_joined`.

### 4. Segurança (RLS)
Garantir que jogadores só possam ler/atualizar suas próprias notificações.

## Mudanças no Frontend (React & TanStack)

### 1. Novo Componente Central: `PlayerEventStatus`
Localizado em `src/components/PlayerEventStatus.tsx`, este componente será a "fonte da verdade" visual:
- Recebe o status calculado (determinado por uma função utilitária).
- Renderiza o estado (Inscrito, Reserva com posição, Não inscrito, etc).
- Identidade visual azul/dourado/verde conforme solicitado.

### 2. Refatoração da Tela de Início (`src/routes/index.tsx`)
- Integrar o `PlayerEventStatus` para exibição compacta.
- Melhorar a seção "Minha Situação" com mensagens claras: "VAGA CONFIRMADA" ou "FILA DE ESPERA".
- Implementar o Modal de Alerta de Promoção: Aparece uma única vez quando o jogador entra no sistema após ser promovido (detectado via notificação não visualizada do tipo `promoted_to_main`).

### 3. Melhoria na Tela de Lista
- Destacar o jogador na reserva com a label "VOCÊ".
- Mostrar a mensagem de "entrada automática" se o jogador estiver na reserva.

### 4. Integração da Central de Notificações
- Badge dinâmico no ícone de sino refletindo notificações não lidas.
- Lista de notificações conectada ao backend com atualização Realtime via Supabase.
- Botão "Marcar como lida" e ordenação cronológica.

## Detalhes Técnicos

- **Transações:** A promoção automática usará bloqueio de linha (`SELECT FOR UPDATE`) para evitar condições de corrida durante a promoção concorrente.
- **Idempotência:** Uso de `idempotency_key` na tabela de notificações (ex: `type-player-event`).
- **Realtime:** Reuso do canal `notifications-userId` e `event-updates-eventId` para refletir as mudanças instantaneamente.
- **Fuso Horário:** Garantir uso de `America/Sao_Paulo` em todos os registros de data/hora.

## Arquivos Afetados
- `supabase/migrations/`: Novas migrações para enum, funções e triggers.
- `src/components/PlayerEventStatus.tsx`: Novo componente.
- `src/routes/index.tsx`: Atualização da Home e lógica central.
- `src/components/NotificationsDialog.tsx`: Integração com backend e realtime.
- `src/lib/notifications.functions.ts`: Adição de novos tipos e tratamentos.
- `src/lib/players-signup.types.ts`: Adição de novos tipos de status.
