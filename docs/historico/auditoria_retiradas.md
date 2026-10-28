# Auditoria e Implementação do Módulo de Retiradas

## 1. Auditoria do Fluxo Atual

### Tabelas Envolvidas
- `registrations`: Tabela principal de inscrições.
- `volleyball_events`: Dados da rodada.
- `app_settings`: Configurações de deadline e penalidades.
- `players`: Dados dos jogadores.
- `admin_actions_log`: Logs de ações administrativas.
- `player_incidents`: Registro de penalidades (late_leave).

### Funções e Componentes Responsáveis
- **Jogador Entrar**: 
    - Frontend: `PlayerRoundStatusCard.tsx` -> `internal_join_event`.
    - Backend: RPC `internal_join_event` (em `public.functions.ts` / Postgres).
- **Jogador Sair**:
    - Frontend: `PlayerRoundStatusCard.tsx` -> `internal_leave`.
    - Backend: RPC `internal_leave_registration_v3`.
- **Admin Remover**:
    - Frontend: `ListTab.tsx` -> `admin_remove`.
    - Backend: RPC `admin_remove_registration_v3`.
- **Reordenação e Promoção Automática**:
    - Implementada dentro de `admin_remove_registration_v3` e `internal_leave_registration_v3` usando estratégia de duas fases (offset 10000).
- **Notificação de Promoção**: Trigger `fn_notify_promotion`.
- **Inativação**: Campo `cancelled_at` preenchido; o registro permanece no banco.
- **Exclusão Física**: Não identificada no fluxo normal; as RPCs usam `UPDATE set cancelled_at`.

## 2. Auditoria das Rodadas Ativas

### Rodadas Encontradas
- **Terça (18/08)**: `2c4d76a5...` - Open (18 Titulares, 0 Reservas).
- **Quarta (19/08)**: `00cb17af...` - Open (18 Titulares, 0 Reservas).
- **Quinta (20/08)**: `df01e65a...` - Open (18 Titulares, 3 Reservas).

### Retiradas Identificadas (Histórico Recente)
- **Poliana Fernandes** (Quarta 19/08): Retirada em 19/08 15:21 por Iago Andrade (Admin).
- **Giane** (Quarta 19/08): Retirada em 19/08 11:50 por Iago Andrade (Admin).
- **Isabely Ramos** (Quinta 20/08): Retirada em 19/08 11:17 por Iago Andrade (Admin).
- **Eduardo Leão** (Terça 18/08): Retirada em 18/08 20:58 por Iago Andrade (Admin).

### Investigação de "Origem Não Identificada"
Foram encontrados registros onde `cancelled_at` está preenchido, mas `cancelled_by_player_id` é **NULL**. 
Exemplos:
- **Eduardo Leão** (6d2f5ee8...): 09/08 03:17.
- **Sammy 🏐** (297f90be...): 09/08 03:16.
- **Gabriel Consoli** (7163e004...): 05/08 20:44.

**Causa Provável**: Estes registros foram afetados por versões anteriores das RPCs ou por scripts de limpeza (`debug-remove.ts`) que não propagaram o ID do autor da ação. Não há evidência de "desaparecimento" por bug de reordenação nas rodadas atuais v3.

## 3. Plano de Implementação

### 3.1. Estrutura de Banco de Dados
Criar a tabela `registration_withdrawals` para persistência do histórico.

### 3.2. Lógica de Registro (Trigger)
Implementar uma trigger `after update` em `registrations` que detecta a transição `cancelled_at IS NULL -> NOT NULL` e insere no histórico. Isso garante atomicidade e aditividade sem alterar as RPCs complexas.

### 3.3. Interface Administrativa
Adicionar a aba "RETIRADAS" em `admin.tsx` e criar o componente `WithdrawalsTab.tsx`.
