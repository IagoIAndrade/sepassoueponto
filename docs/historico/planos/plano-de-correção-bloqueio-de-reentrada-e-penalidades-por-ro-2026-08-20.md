# Plano de Correção: Bloqueio de Reentrada e Penalidades por Rodada

O objetivo é impedir que jogadores que saíram após o prazo retornem à mesma rodada e garantir que a penalidade de bloqueio seja aplicada nas próximas rodadas reais da turma, e não em dias sequenciais.

## 1. Banco de Dados (SQL)

### 1.1. Refatorar `internal_is_blocked`
*   Adicionar suporte a `scope` e `group_id`.
*   Se `scope = 'group'`, validar se o `group_id` do bloqueio coincide com o da rodada.
*   Se `scope = 'global'`, o bloqueio vale para qualquer turma.

### 1.2. Atualizar `internal_join_event`
*   Adicionar validação obrigatória contra reentrada após `late_leave` (mesma rodada).
*   Garantir que chama `internal_is_blocked` com 3 argumentos.
*   Retornar erro específico `late_leave_rejoin_forbidden`.

### 1.3. Atualizar `admin_add_player`
*   Adicionar a mesma validação contra reentrada (exceto se `p_force_override` for true).

### 1.4. Refatorar `internal_leave_registration_v3`
*   Corrigir o cálculo das próximas N rodadas para a penalidade.
*   Se não existirem rodadas futuras agendadas, calcular as datas baseadas no `withdrawal_deadline_weekday` da turma (adicionando 7 dias sucessivamente).

## 2. Frontend (`src/routes/index.tsx`)

### 2.1. Melhorar UI de Status
*   Detectar se existe incidente `late_leave` ativo para o evento atual.
*   Se existir, ocultar o botão de "ENTRAR" e exibir o aviso "SAÍDA TARDIA REGISTRADA".

### 2.2. Tratamento de Erros
*   Mapear `late_leave_rejoin_forbidden` para uma mensagem amigável no toast.

### 2.3. Auditoria de Inscrição
*   Garantir que todos os caminhos de inscrição (`join_self`, `join_other`) respeitem as novas regras.

## 3. Testes
*   Simular saída tardia.
*   Verificar bloqueio de reentrada na mesma rodada.
*   Verificar datas dos bloqueios gerados (próximas quintas-feiras, por exemplo).
*   Verificar bloqueio em rodadas futuras.
