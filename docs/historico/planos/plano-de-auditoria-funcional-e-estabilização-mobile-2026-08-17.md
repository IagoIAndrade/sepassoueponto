# Plano de Auditoria Funcional e Estabilização Mobile

Auditoria e estabilização do fluxo mobile do jogador para garantir consistência de dados, funcionamento de ações e padronização de interface.

## Auditoria e Mapeamento

- **Query Início:** `event-full` (RPC `get_current_event_full`).
- **Query Lista:** `event-full` (mesma fonte).
- **Query Times:** `event-full` (mesma fonte).
- **Query Minhas Inscrições:** `my-regs` (RPC `get_my_registrations`).
- **Estado de Inscrição:** Derivado de `mySelfReg` (de `my-regs`) e `sortedRegs` (de `event-full`).
- **Push:** Funções `handleTogglePush`, `savePushSubscription`, `removePushSubscription`.
- **Editar Perfil:** Dialog `editNameOpen` (identificado como P0 funcional).

## P0 — Inconsistências de Dados e Fluxo

### 1. Fonte Única da Inscrição
- **Problema:** "Minhas Inscrições" mostra vazio enquanto o usuário está na lista do Início/Lista.
- **Causa provável:** Divergência entre `my-regs` (usado no modal) e a lista global filtrada no Início.
- **Solução:** Reconciliar o `my-regs` para garantir que utilize o mesmo `activeGroupId` e `eventId` da rodada atual.

### 2. Contador de Titulares (/18)
- **Problema:** Numerador ausente ou `undefined`.
- **Solução:** Corrigir a passagem de props em `PlayerRoundStatusCard` garantindo que `event.main_count` nunca seja omitido (usar `|| 0`).

### 3. Editar Perfil
- **Problema:** Opção no menu não abre a interface.
- **Solução:** Conectar o botão do menu ao estado `editNameOpen` já existente no `src/routes/index.tsx`.

### 4. Push e Sessão Expirada
- **Problema:** Erro de sessão mesmo com usuário logado.
- **Causa provável:** Token stale ou expiração do cookie de sessão do servidor.
- **Solução:** Adicionar renovação forçada de sessão via `supabase.auth.refreshSession()` antes de cada chamada crítica de Push.

## P1 — Refinamento UX/UI

### 1. Modais e Bottom Nav
- **Problema:** Bottom nav interage por trás dos modais; falta padronização.
- **Solução:** Ocultar a `MobileNavBar` quando qualquer modal importante estiver aberto.
- **Autoavaliação:** Transformar em Full-screen Sheet no mobile.

### 2. Remoção de Banner
- **Solução:** Exibir o banner de Push apenas na aba `inicio`.

### 3. Rateio / Financeiro
- **Melhoria:** Enriquecer o modal com dados reais do rateio (Total, Arrecadado, Percentual) já presentes no backend.

## Detalhes Técnicos

- **Sincronização:** Invalidação coordenada de queries após qualquer ação (join/leave/push).
- **Datas:** Manutenção do padrão "Civil Date" para evitar timezone shift.
- **Segurança:** Manter as RPCs `SECURITY DEFINER` e validações de `player_id` vs `auth.users.id`.
