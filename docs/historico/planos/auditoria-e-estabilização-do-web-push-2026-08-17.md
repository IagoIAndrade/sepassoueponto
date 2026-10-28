# Auditoria e Estabilização do Web Push

O sistema de Push falha porque a sessão do jogador (`vg_player_session`) reside no domínio da aplicação, enquanto o backend de Push está sendo chamado em um contexto onde o cookie não é automaticamente enviado ou validado.

## Análise P0
- **COOKIE HOST**: `localhost:8080` (Preview) / `se-passou-e-ponto.lovable.app` (Produção).
- **PUSH URL**: Chamado via `serverFn` do TanStack Start.
- **EXECUTOR**: `src/lib/push.functions.ts` é uma Server Function. Ela executa no **APP SERVER** (Node/Worker), não no browser.
- **ERRO**: O erro "SESSÃO EXPIRADA" ocorre porque `readSessionCookie()` retorna nulo ou a validação no banco falha.

## Alterações Propostas

### 1. Diagnóstico e Resiliência (Backend)
- Adicionar logs de auditoria `[PUSH SERVER AUTH]` no handler das Server Functions para identificar se o cookie está chegando ao servidor.
- Garantir que `supabaseAdmin` seja usado para todas as operações de banco no Push, eliminando dependências de permissões RLS do usuário (já que a identidade é validada via RPC customizada).

### 2. Estabilização do Frontend
- Refatorar `handleTogglePush` em `src/routes/index.tsx` para garantir que a permissão de notificação seja solicitada ANTES da chamada ao servidor.
- Melhorar o tratamento de erros: não converter erros genéricos (ex: permissão negada) em "Sessão Expirada".

### 3. Ajustes de Autenticação
- Remover qualquer resquício de `supabase.auth` das chamadas de Push do jogador, focando exclusivamente na `vg_player_session`.

## Detalhes Técnicos
- Arquivo: `src/lib/push.functions.ts`
- Arquivo: `src/routes/index.tsx`
- Logs: Instrumentação com `console.log("[PUSH SERVER AUTH]", ...)` e `[PUSH CLIENT TRACE]`.
- Fluxo:
  1. Browser solicita permissão.
  2. Browser gera `PushSubscription`.
  3. Browser chama `savePushSubscription` (Server Function).
  4. Server Function recebe o cookie automaticamente (Same-Origin).
  5. Server Function valida via `internal_validate_session`.
  6. Server Function persiste no banco via `supabaseAdmin`.
