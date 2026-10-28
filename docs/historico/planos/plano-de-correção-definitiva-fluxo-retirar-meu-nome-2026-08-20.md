# Plano de Correção Definitiva — Fluxo RETIRAR MEU NOME

Consertar a inconsistência de contrato entre o frontend, server functions e a RPC do banco de dados para garantir que a retirada de jogadores seja real, auditada e reflita imediatamente na interface.

## 1. Ajuste na RPC do Banco de Dados
Refatorar `internal_leave_registration_v3` para:
- **Cálculo de Deadline Canônico**: Usar `withdrawal_deadline_weekday` e `withdrawal_deadline_time` das configurações da turma (ajustado para o fuso `America/Sao_Paulo`) para definir o prazo de saída sem multa.
- **Contrato Estrito**: Retornar objetos JSON uniformes diferenciando `late_leave_confirmation_required` (com metadados do prazo) e `success` (após a retirada efetiva).
- **Atomicidade Total**: Garantir que a transação inclua:
  1. `UPDATE registrations SET cancelled_at = now()` (com autor correto).
  2. `INSERT INTO registration_withdrawals` (novo schema).
  3. `INSERT INTO player_incidents` (tipo `late_leave`, idempotente).
  4. Aplicação de bloqueio (`player_blocks`) para as próximas `penalty_late_leave` rodadas válidas.
  5. Reordenação e promoção automática de reservas.

## 2. Refatoração da Server Function
Ajustar `leave_registration` em `src/lib/public.functions.ts` para:
- Repassar fielmente o status da RPC.
- Garantir que erros de autenticação (`not_authenticated`) sejam tratados separadamente de erros de lógica.

## 3. Correção na Interface (Frontend)
Ajustar `src/routes/index.tsx`:
- **Impedir "Falso Sucesso"**: Só exibir toast de sucesso e invalidar queries se a resposta for `ok` / `success`.
- **Idempotência e Feedback**: Desabilitar botões durante a execução e invalidar queries canônicas (`event-full`, `my-regs`, `me`) para atualização atômica do estado.

## Detalhes Técnicos
- O cálculo do deadline em SQL considerará a rodada ativa, recuando para o dia da semana configurado na semana da rodada.
- O bloqueio usará a função canônica de datas do projeto para identificar rodadas futuras da mesma turma.
- O `incident_type` será fixado como `late_leave`.
