# Plano de Correção Definitiva — Fluxo de Retirada

A auditoria confirmou que a função `internal_leave_registration_v3` no banco ainda contém casts para o tipo inexistente `public.deadline_status` e tenta inserir manualmente na tabela `registration_withdrawals`, o que causa erro de permissão ou duplicação (devido ao trigger). Além disso, a tabela `player_blocks` não possui a coluna `incident_id`.

## Ações Técnicas

### 1. Banco de Dados (SQL)
- **Substituir `internal_leave_registration_v3`**:
    - Remover todos os casts `::public.deadline_status`.
    - Remover o `INSERT` manual em `registration_withdrawals` (delegar ao trigger).
    - Remover o campo `incident_id` do `INSERT` na tabela `player_blocks`.
    - Corrigir a lógica de `deadline_status` para usar os valores literais `'late'` ou `'in_time'`.
    - Garantir o cálculo de deadline canônico respeitando o timezone configurado.
- **Sincronizar `fn_log_registration_withdrawal` (Trigger)**:
    - Unificar a lógica de cálculo de deadline com a da RPC para evitar discrepâncias.

### 2. Frontend (React)
- **Ajustar `src/components/PlayerEventStatus.tsx`**:
    - Garantir que o aviso de prazo utilize a data formatada corretamente no fuso `America/Sao_Paulo`.
    - Validar o contrato da RPC para exibir a confirmação de saída tardia com o horário correto (10:00 e não 04:00).

### 3. Server Functions
- **Validar `src/lib/public.functions.ts`**:
    - Assegurar que `leave_registration` trate corretamente o retorno `late_leave_confirmation_required` e os dados de `deadline_at`.

## Auditoria de Segurança e Integridade
- Validar se a função ativa no banco após a atualização não possui referências a enums ou colunas inexistentes.
- Confirmar que a retirada promove o próximo reserva atomicamente sem quebrar a ordenação.

## Passos de Verificação
1. Executar `pg_get_functiondef` após a migração.
2. Testar o fluxo completo no mobile (confirmar horário de deadline e execução da retirada).
3. Verificar no banco os registros em `registrations` (cancelado), `registration_withdrawals` (auditado pelo trigger) e `player_blocks`.
