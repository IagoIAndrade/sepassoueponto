# Plano de Automação do Ciclo de Rodadas

Automatizar o encerramento, criação e abertura das rodadas para as turmas recorrentes (Terça, Quarta e Quinta), utilizando `pg_cron` e funções SQL server-side para garantir a integridade dos dados e independência do frontend.

## Ações Técnicas

### 1. Backend (SQL & Cron)
- **Nova Função `public.internal_cycle_rounds()`**:
  - Centralizar a lógica de manutenção das rodadas.
  - **Reconciliação/Encerramento**: Identificar rodadas ativas (`open`, `closed`, `scheduled`) cujas datas já passaram (considerando fuso `America/Sao_Paulo`) e marcá-las como `completed`.
  - **Criação Automática**: Para cada turma ativa, verificar se existe uma rodada futura programada. Caso não exista, chamar `public.admin_create_next_event_v2_internal` (uma versão da RPC sem checagem de `auth.uid()` para uso do sistema).
  - **Idempotência**: A função `internal_compute_next_round` já possui proteções contra duplicidade que serão preservadas.
- **Nova Função `public.admin_create_next_event_v2_internal(p_group_id uuid)`**:
  - Refatorar a lógica da RPC `admin_create_next_event_v2` para uma função interna que possa ser chamada tanto pelo Admin quanto pelo Cron.
- **Agendamento Cron**:
  - Criar um job `cron.schedule('round_cycling_job', '1 * * * *', 'SELECT public.internal_cycle_rounds()')` para rodar a cada 1 hora (ou diariamente à 00:01).
  - Ajustar o job existente `process_event_openings` para garantir que as rodadas recém-criadas abram no momento certo.

### 2. Frontend (Ajustes de UX)
- **Botão "Criar Próxima Rodada"**:
  - Manter o botão na interface administrativa.
  - Atualizar o feedback visual: se a rodada já existir, exibir mensagem informativa em vez de erro genérico.

### 3. Migração de Dados
- Executar a rotina inicial para encerrar os eventos pendentes (ex: 19/08 e 20/08 que ainda estão `open`).

## Detalhes Técnicos
- **Timezone**: Fixo em `America/Sao_Paulo`.
- **Status das Rodadas**: 
  - `scheduled`: Criada, aguardando abertura.
  - `open`: Aberta para inscrições (processado por `internal_process_due_event_openings`).
  - `completed`: Rodada finalizada (processado por `internal_cycle_rounds`).
- **Logs**: Inserir registros em `admin_actions_log` com os tipos `AUTO_ROUND_CLOSE` e `AUTO_ROUND_CREATE`.

## Verificação e Testes
1. **Teste 1 (Encerramento)**: Validar se eventos com data < hoje são encerrados.
2. **Teste 2 (Criação)**: Validar se a próxima rodada é gerada para Terça, Quarta e Quinta.
3. **Teste 3 (Abertura)**: Confirmar que `opens_at` é calculado corretamente e respeitado pelo job de abertura.
4. **Teste 4 (Idempotência)**: Executar a função múltiplas vezes e garantir que não há duplicatas.
5. **Teste 5 (Histórico)**: Garantir que inscrições e times de rodadas encerradas permanecem intactos.
