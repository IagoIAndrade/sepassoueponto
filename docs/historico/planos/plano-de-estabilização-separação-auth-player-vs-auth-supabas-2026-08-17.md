# Plano de Estabilização: Separação Auth Player vs Auth Supabase (Admin)

O objetivo é separar definitivamente o contexto de Push (que exige Supabase Auth temporário para configurar subscrições) da Autorização Administrativa (que exige Supabase Auth permanente) e da Sessão do Jogador (cookie HttpOnly).

## 1. Diagnóstico e Separação de Estados no Frontend
Atualmente, `src/routes/index.tsx` utiliza um único objeto `me` vindo da query `["me"]` para decidir se o usuário está logado e se é admin.

**Problema:** Se o Push falhar ou deslogar o Supabase Auth, o campo `me.role` pode ser perdido ou a query invalidada de forma agressiva.

### Ações:
- Refatorar a query `["me"]` para ser a fonte de verdade apenas do **Jogador** (via cookie).
- Criar uma query separada `["admin-check"]` ou utilizar a propriedade `isAdmin` vinda de uma verificação que não dependa de efeitos colaterais do Push.
- Garantir que o `handleTogglePush` **não** invalide a query `["me"]`.

## 2. Proteção contra Invalidação Indevida (Push Audit)
O fluxo de Push atualmente faz `supabase.auth.refreshSession()` e validações que podem disparar eventos `SIGNED_OUT` no listener global.

### Ações:
- Ajustar `src/routes/index.tsx`: O listener `onAuthStateChange` deve ignorar `SIGNED_OUT` para fins de autorização do jogador (já feito parcialmente, mas verificar se há `qc.invalidateQueries(["me"])` oculto).
- Revisar `src/integrations/supabase/auth-attacher.ts`: Garantir que o refresh silencioso não interrompa o fluxo se falhar.

## 3. Consistência do Painel Administrativo
A rota `/_admin` depende de `check_admin()`. Se o link desapareceu da Home, o bug é no `src/routes/index.tsx`.

### Ações:
- Em `src/routes/index.tsx`, a condição `(me as any).role === 'admin'` é frágil se `me` vier de uma query que o Push modifica.
- Criar um estado derivado robusto:
```typescript
const isAdmin = meQ.data?.player?.role === 'admin';
```
- Adicionar logs de trace `[ADMIN ACCESS TRACE]` para monitorar o exato momento em que `role` se torna `undefined`.

## 4. Auditoria do Objeto "ME"
Evitar que respostas parciais do servidor ou `setQueryData` manuais destruam o objeto.

### Ações:
- Substituir qualquer `qc.setQueryData(["me"], { ... })` que não use a função de callback `old => ({ ...old, ... })`.

## Detalhes Técnicos
- **Fonte Admin**: `auth.users` role via RLS/RPC.
- **Identificadores**: Manter a distinção entre `players.id` (cookie) e `auth.users.id` (admin).
- **Push**: Tratar como recurso opcional. Falha no push = Toast de erro, mas `isAdmin` mantido.

## Verificação Sugerida
1. Login Admin -> Link visível.
2. Ativar Push -> Link deve permanecer visível.
3. Erro de Push (Sessão Expirada) -> Link deve permanecer visível.
4. Reload -> Link deve permanecer visível.
