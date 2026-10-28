# AUDITORIA DE ESTABILIZAÇÃO

## 1. Causa do erro ADMIN_ADD
**Diagnóstico:** O erro "Não foi possível concluir a operação" ao adicionar um jogador via painel administrativo ocorre por uma falha de permissão na RPC `admin_add_player`. 
Apesar de a migração `20260807...` definir a função, as políticas de segurança recentes e os `REVOKE` em massa podem ter removido o `GRANT EXECUTE` para a role `authenticated` (usada pelo admin logado) ou a função está tentando acessar tabelas sem os grants necessários.
Além disso, há um log no frontend indicando que a resposta do backend pode estar vindo em um formato não esperado pelo catch genérico da `AddPlayerModal.tsx`.

## 2. Função/RPC usada por ADMIN_ADD
O fluxo é: 
`AddPlayerModal.tsx` → `admin_add` (Server Fn em `admin.functions.ts`) → `admin_add_player` (RPC Postgres).

## 3. Origem do toast genérico
O toast "Não foi possível concluir a operação. Tente novamente." vem da função `friendlyError` em `src/lib/error-messages.ts`, que é usada em quase todos os blocos `catch` do sistema.
**Causa específica da home:** O `useEffect` de Push Notifications em `src/routes/index.tsx` (ou o carregamento inicial de `getMyPushSubscriptions`) está falhando (provavelmente 401 Unauthorized ou erro de Service Worker) e disparando o toast via `friendlyError` no catch do carregamento inicial, o que bloqueia visualmente o usuário.

## 4. Função que decide acesso da turma
Atualmente, a lógica está fragmentada:
- **Backend:** `get_current_event_full` em `public.functions.ts` verifica a tabela `player_groups`.
- **Frontend:** O componente `Index` em `src/routes/index.tsx` usa `myAccesses` e `myGroupsAccess` derivados de `get_my_group_accesses`.
**Problema:** Existe inconsistência entre o que o `eventQ` (público) retorna e o que o `accessesQ` (privado) possui em cache, especialmente após mudanças administrativas.

## 5. Relação real entre auth.uid() e players.id
No schema atual:
- `auth.users` (Tabela interna do Supabase)
- `public.players` (Tabela da aplicação)
A relação é `public.players.user_id = auth.users.id`.
**Erro identificado:** Algumas policies recentes estão comparando `player_id = auth.uid()`. Isso está **INCORRETO**, pois `auth.uid()` retorna o ID do usuário (auth), não o ID do jogador (players).

## 6. Dependências recentes em internal_join_event
Recentemente (migração `20260813022655`), foram adicionados:
- `public.lock_event(p_event_id)`
- Inserção em `public.notifications`
- Chamada para `public.player_is_paid_up`
- Verificação de `opens_at`
**Impacto:** Se qualquer uma dessas funções internas falhar (ex: falta de Grant), a inscrição (join) falha. O admin_add_player também chama validações similares.

## 7. Push interferindo em operações principais
**Sim.** O trigger de notificações no banco de dados está acoplado ao fluxo de inscrição. Se o `trigger_push_notification` ou a inserção na `push_notification_outbox` falhar, a transação da inscrição (join/leave) sofre rollback. Além disso, no frontend, erros de Push não capturados adequadamente estão interrompendo o fluxo de renderização/feedback da Home.

---
*Aguardando aprovação da auditoria para iniciar as correções seguindo o modo de estabilização.*
