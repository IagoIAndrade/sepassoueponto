# Relatório de Correção Definitiva — Auditoria e Persistência de Retiradas

A correção foi aplicada com sucesso e o banco de dados agora possui um modelo de auditoria robusto e determinístico, separando identidades de Jogadores e Administradores.

## 1. Status da Migration
A migration anterior estava pendente/parcial. Apliquei a versão **v3** (`fix_withdrawal_audit_v2`) que realizou o DROP das funções antigas para permitir a alteração do tipo de retorno e argumentos, garantindo a integridade do processo.

## 2. Mudanças no Schema
### Antes:
- Tabela `registration_withdrawals`: Coluna única `removed_by_id` com FK obrigatória para `auth.users`. Causava erro `42501` quando um jogador (que não está em `auth.users`) tentava sair da lista.
- Tabela `registrations`: Apenas `cancelled_by_player_id`, misturando IDs de Admin e Jogador.

### Depois:
- **Tabela `registration_withdrawals`**:
  - `removed_by_id`: **REMOVIDA**.
  - `removed_by_player_id`: **ADICIONADA** (FK → `players.id`).
  - `removed_by_admin_user_id`: **ADICIONADA** (FK → `auth.users.id`).
  - `removal_source`: Atualizado para aceitar `('player', 'admin', 'system')`.
- **Tabela `registrations`**:
  - `cancelled_by_admin_user_id`: **ADICIONADA** (FK → `auth.users.id`).
  - `cancelled_by_player_id`: Agora usada exclusivamente para jogadores.

## 3. Correção de Lógica (RPCs e Trigger)
- **`admin_remove_registration_v3`**: Agora grava explicitamente em `cancelled_by_admin_user_id`.
- **`internal_leave_registration_v3`**: Agora grava explicitamente em `cancelled_by_player_id`.
- **`fn_log_registration_withdrawal`**: Refatorado para ler os campos explícitos e preencher a auditoria de retiradas corretamente, sem ambiguidades.

## 4. Auditoria Determinística (Backfill)
O script de migração realizou um backfill inteligente:
- Se `removal_source` era 'admin', tentou validar o ID em `auth.users` e depois em `players`.
- Se era 'player', tentou validar em `players` e depois em `auth.users`.
- Registros não identificados foram marcados como `system`.
- **Nenhum histórico foi apagado.**

## 5. Validação Frontend
- `src/lib/withdrawals.functions.ts`: Atualizado para o novo schema, removendo dependências de colunas excluídas.
- `src/routes/_admin/tabs/WithdrawalsTab.tsx`: Ajustado para exibir as origens conforme o novo modelo canônico.

A integridade referencial está restaurada e o fluxo de saída do jogador agora funciona sem erros de chave estrangeira.

**BUILD_ID: v2026.08.20.1445**
