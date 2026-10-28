# Plano de Correção Definitiva — Auditoria e Persistência de Retiradas

O objetivo é separar definitivamente as identidades de Jogador (`players.id`) e Administrador (`auth.users.id`) no banco de dados, corrigindo o erro de FK (`registration_withdrawals_removed_by_id_fkey`) e unificando o modelo de auditoria.

## 1. Banco de Dados (Migration Corrigida)

A migration `supabase/migrations/20260820140001_fix_withdrawal_audit.sql` será reescrita para ser mais robusta e determinística:

- **Tabela `registrations`**:
  - Adicionar `cancelled_by_admin_user_id` (FK → `auth.users.id`).
  - Manter `cancelled_by_player_id` exclusivamente para IDs de `public.players`.
- **Tabela `registration_withdrawals`**:
  - Remover `removed_by_id`.
  - Adicionar `removed_by_player_id` (FK → `public.players`) e `removed_by_admin_user_id` (FK → `auth.users`).
  - Atualizar `removal_source` para aceitar `('player', 'admin', 'system')`.
  - **Backfill Determinístico**: Para cada registro antigo, verificar se o ID existe na tabela `players` ou `auth.users` antes de migrar.
- **Trigger `fn_log_registration_withdrawal`**:
  - Refatorar para usar as origens explícitas de `registrations` (`cancelled_by_player_id` vs `cancelled_by_admin_user_id`).

## 2. Funções RPC (Backend)

Atualizar as funções para preencher o campo correto conforme o ator:

- **`admin_remove_registration_v3`**:
  - Alterar para preencher `cancelled_by_admin_user_id` com o ID do admin e deixar `cancelled_by_player_id` como `NULL`.
- **`internal_leave_registration_v3`**:
  - Garantir que preencha apenas `cancelled_by_player_id`.
- **Automação (Sistema)**:
  - Garantir que ambos os campos sejam `NULL`.

## 3. Server Functions & UI (Frontend)

- Atualizar `src/lib/withdrawals.functions.ts` para refletir o novo schema sem usar `any` ou casts perigosos.
- Ajustar a aba de Retiradas no Admin para exibir os nomes corretamente buscando nas tabelas apropriadas.

## 4. Validação & Testes Reais

- **Teste Jogador**: Realizar uma retirada via interface mobile e validar `removal_source = 'player'` e `removed_by_player_id` preenchido.
- **Teste Admin**: Realizar uma remoção via Painel Admin e validar `removal_source = 'admin'` e `removed_by_admin_user_id` preenchido.
- **Auditoria de Schema**: Executar queries de verificação para confirmar a ausência das colunas e constraints antigas.

## Detalhes Técnicos

```text
- Tabela: public.registrations
  + cancelled_by_admin_user_id (uuid, FK auth.users)
  
- Tabela: public.registration_withdrawals
  - removed_by_id (removida)
  + removed_by_player_id (uuid, FK public.players)
  + removed_by_admin_user_id (uuid, FK auth.users)
  ~ removal_source: CHECK (player, admin, system)
```

A integridade referencial será garantida pela separação física dos campos, eliminando a ambiguidade que causava o erro de FK.
