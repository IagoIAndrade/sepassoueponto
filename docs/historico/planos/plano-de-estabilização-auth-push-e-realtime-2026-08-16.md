# Plano de Estabilização: Auth, Push e Realtime

Este plano visa corrigir as regressões críticas de autenticação (HTTP 400 em refresh tokens e Unauthorized em Push), eliminar logs excessivos em produção e otimizar o ciclo de vida do Realtime.

## 1. Autenticação (Auth)
- **Diagnóstico:** O erro HTTP 400 no `/auth/v1/token` ocorre devido a concorrência de refresh tokens ou tentativas de refresh com sessões já expiradas/limpas no cliente mas ainda persistidas. O loop `SIGNED_OUT -> INITIAL_SESSION` indica que o estado de "session_expired" não está sendo tratado de forma atômica no bootstrap.
- **Correção:**
    - Ajustar `src/routes/index.tsx` para evitar chamadas `refreshAll()` ou requisições autenticadas enquanto `meQ.isLoading` for verdadeiro.
    - Centralizar o tratamento de `SIGNED_OUT` no `onAuthStateChange` para garantir que o Query Client seja limpo e que não haja novas tentativas de fetch antes da re-autenticação.
    - Adicionar um flag de `authReady` mais robusto que aguarda a resolução do `meQ` inicial.

## 2. Web Push
- **Diagnóstico:** O erro `Unauthorized: No authorization header provided` ocorre porque a server function `getMyPushSubscriptions` é chamada sem o JWT no cabeçalho `Authorization`. O middleware `attachSupabaseAuth` depende de `supabase.auth.getSession()`, que pode ser assíncrono ou falhar se a sessão não estiver pronta.
- **Correção:**
    - Modificar `src/lib/push.functions.ts` para que `getMyPushSubscriptions` e outras funções protegidas não sejam disparadas no `useEffect` se a sessão Supabase ainda não estiver disponível.
    - Garantir que `attachSupabaseAuth` em `src/integrations/supabase/auth-attacher.ts` aguarde a restauração da sessão se necessário, ou que o frontend proteja a chamada.
    - Em `src/routes/index.tsx`, alterar o `enabled` das queries de Push para dependerem explicitamente de `me?.id`.

## 3. Realtime e Repetições (Access Audit)
- **Diagnóstico:** Múltiplas subscriptions Realtime ocorrem porque o `useEffect` que gerencia o canal depende de `eventQ.data?.event?.id`, mas não possui uma verificação rigorosa de canal existente, ou o cleanup `supabase.removeChannel` não está sendo eficaz em todas as transições de aba.
- **Access Audit:** As repetições de log são causadas por `console.log` no corpo da função `Index` que executa a cada re-render (triggers: timer de 1s, animações, updates de query).
- **Correção:**
    - Refatorar os logs de `[ACCESS AUDIT]` para dentro de `useEffect` com dependências específicas ou removê-los, mantendo apenas logs de erro.
    - Unificar a lógica de Realtime em um hook ou garantir que `supabase.channel().subscribe()` verifique o estado antes de criar novos canais.
    - Remover logs de `[DEBUG_UI]` em produção usando uma verificação de `process.env.NODE_ENV`.

## 4. Mapeamento Auth User vs Player
- **Diagnóstico:** Inconsistência entre `auth.uid()` (usado pelo Push via `context.userId`) e o `player_id` da aplicação (usado pelo sistema de inscrição).
- **Correção:** 
    - Manter a arquitetura atual mas documentar e garantir que as tabelas de Push (`push_subscriptions`) continuem usando o ID de autenticação como proprietário, enquanto o sistema de jogo usa o ID da tabela `players`.

## Detalhes Técnicos
- **Local:** `src/routes/index.tsx`, `src/lib/push.functions.ts`, `src/integrations/supabase/auth-attacher.ts`.
- **Estratégia:** Search-Replace para remoção de logs e adição de guards de autenticação.
- **Segurança:** Não tornar endpoints públicos; manter middleware de proteção JWT.
