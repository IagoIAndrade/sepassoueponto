# Plano de Correção: Saída da Lista no Mobile/PWA

Auditoria e correção do fluxo de saída da lista (`SAIR DA LISTA`) para jogadores autenticados via Mobile/PWA, garantindo que a promoção automática de reservas e notificações funcionem corretamente.

## Causa Raiz Hipotética
- **Sessão/Token**: Inconsistência entre o estado da UI (`meQ.data`) e o token de sessão HTTP-Only (`vg_player_session`) ou o token Supabase (JWT), similar ao problema anterior no Push.
- **RPC/Assinatura**: Incompatibilidade entre os parâmetros enviados pelo frontend e o que a RPC `internal_leave_registration_v2` espera.
- **RLS/Permissões**: Restrições no banco que impedem a execução da RPC pelo jogador, mesmo autenticado.
- **Cache/Invalidation**: Falha em atualizar o cache do TanStack Query após a saída bem-sucedida no backend.

## Etapas de Implementação

### 1. Auditoria e Logs Temporários (Diagnóstico)
- Adicionar logs detalhados em `doLeaveSelf` (frontend) e `leave_registration` (server function) para rastrear:
  - Presença de `registration_id`.
  - Validez da sessão antes da chamada.
  - Resposta exata da RPC (sucesso ou erro PostgreSQL).

### 2. Refinamento da Server Function (`src/lib/public.functions.ts`)
- Garantir que a `leave_registration` server function valide a sessão de forma robusta.
- Tratar erros específicos da RPC para retornar mensagens úteis ao frontend (code, message, hint).

### 3. Ajustes no Componente Principal (`src/routes/index.tsx`)
- **Gestão de Sessão**: Antes de chamar a saída, verificar/renovar a sessão Supabase (similar ao fluxo de Push) para garantir que o JWT esteja válido caso a RPC dependa dele via `attachSupabaseAuth`.
- **Prevenção de Duplicidade**: Desabilitar botões e diálogos durante o processamento (`leaveBusy`).
- **Invalidation Estratégica**: Garantir que `refreshAll` limpe todos os caches relevantes:
  - `["event-full", activeGroupId]`
  - `["my-regs", event.id, me.id]`
  - `["my-fund-status", ...]`
  - `["notifications"]`

### 4. Backend (SQL/RPC)
- Verificar a definição de `internal_leave_registration_v2` no banco.
- Confirmar que o `GRANT EXECUTE` está correto para `authenticated`.
- Garantir que a promoção automática utilize `FOR UPDATE` para evitar condições de corrida (Race Conditions) em acessos concorrentes.

## Testes Obrigatórios (End-to-End)
1. **Teste A (Titular)**: Jogador na Lista Principal sai -> Verificado: removido, status muda para "NÃO INSCRITO".
2. **Teste B (Promoção)**: Jogador A (titular) sai, Jogador B (reserva #1) é promovido -> Verificado: B vira titular automaticamente.
3. **Teste C (Reserva)**: Jogador reserva sai -> Verificado: removido da fila, posições seguintes ajustadas.
4. **Teste D (Mobile Real)**: Simular toque mobile (click vs touch) para garantir que eventos de toque não sejam ignorados ou bloqueados por overlays.
5. **Teste E (Segurança)**: Usuário tenta sair de uma inscrição que não é sua -> Verificado: erro de permissão.
