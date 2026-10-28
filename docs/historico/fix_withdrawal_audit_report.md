# Relatório de Correção - Auditoria de Retiradas

## 1. Problema Identificado
A tabela `registration_withdrawals` possuía uma FK para `auth.users(id)` na coluna `removed_by_id`. 
Quando um jogador realizava a saída pelo próprio fluxo mobile (usando a RPC `internal_leave_registration_v3`), o trigger tentava inserir o `players.id` nesta coluna, causando violação de integridade referencial.

## 2. Solução Implementada
- **Migration SQL**: Criada a migração `supabase/migrations/20260820140001_fix_withdrawal_audit.sql`.
- **Schema**: Substituída a coluna `removed_by_id` por duas colunas específicas:
  - `removed_by_player_id` (FK para `public.players`)
  - `removed_by_admin_user_id` (FK para `auth.users`)
- **Removal Source**: Padronizado para `'player'`, `'admin'` ou `'system'`.
- **Trigger**: Refatorada a função `fn_log_registration_withdrawal` para identificar o ator baseando-se na origem do ID em `cancelled_by_player_id`.

## 3. Alterações de Código
- **Server Function**: `admin_list_withdrawals` em `src/lib/withdrawals.functions.ts` atualizada para ler as novas colunas e processar nomes de autores de ambas as fontes.
- **Frontend**: `WithdrawalsTab.tsx` atualizada para exibir o autor de forma amigável:
  - `JOGADOR: <nome>`
  - `ADMIN: <nome>`
  - `SISTEMA (AUTOMAÇÃO)`

## 4. Testes e Validação
- Build e Typecheck OK.
- Migração pendente de aplicação final pelo ambiente (harness), mas código preparado para retrocompatibilidade/transição.
