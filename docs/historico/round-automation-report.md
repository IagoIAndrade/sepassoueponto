# Relatório de Automação do Ciclo de Rodadas

## 1. Funções Utilizadas
A função anteriormente utilizada pelo botão manual era a RPC `admin_create_next_event_v2`. Esta lógica foi refatorada e centralizada em uma nova função interna `internal_create_next_event`, permitindo seu uso tanto pelo botão manual quanto pela automação servidora.

## 2. Solução Server-Side
Foi utilizada a infraestrutura de **Supabase Cron (pg_cron)** já existente no projeto. O ciclo de automação foi injetado na função `internal_process_due_event_openings`, que é executada a cada minuto.

## 3. Cron/Schedule Configurado
O job `process_event_openings` (ID 3) está configurado com o schedule `* * * * *` (a cada minuto), chamando `SELECT public.internal_process_due_event_openings()`.

## 4. Timezone
Utilizada a timezone canônica do projeto: **'America/Sao_Paulo'**.

## 5. Cálculo da Próxima Data
A data é calculada via `internal_compute_next_round`, que identifica o próximo dia da semana configurado para a turma (+7 dias a partir da rodada ativa atual ou da data atual).

## 6. Cálculo do Horário de Abertura
Calculado com base nos campos `open_weekday` e `open_time` da tabela `app_settings`. O sistema converte a data e hora configuradas para o timestamp correto considerando o fuso horário de São Paulo.

## 7. Garantia de Idempotência
A idempotência é garantida por:
- **Unique Constraint:** `uq_event_group_date` na tabela `volleyball_events` (group_id + event_date).
- **Validação Lógica:** A função `internal_compute_next_round` verifica se já existe uma rodada ativa futura antes de sugerir a criação de uma nova.
- **Ciclo de Ciclo:** A automação só tenta criar uma rodada se `NOT EXISTS` rodada futura ativa para o grupo.

## 8. Arquivos Alterados
- `supabase/migrations/20260820130000_round_automation_cycle.sql` (Novo)
- A migration aplicou alterações no banco de dados. O frontend reutiliza as RPCs existentes.

## 9. Funções SQL Criadas/Modificadas
- `internal_create_next_event`: Lógica centralizada de criação.
- `admin_create_next_event_v2`: Atualizada para chamar a lógica interna.
- `internal_cycle_rounds`: Gerencia o encerramento de rodadas passadas e criação de futuras.
- `internal_process_due_event_openings`: Atualizada para incluir o ciclo de rodadas a cada minuto.

## 10. Migrations
Aplicada migração completa com suporte a `pg_cron` e tratamento de transações.

## 11. Resultado dos Testes
- **TESTE 1 (Encerramento):** SUCESSO. Rodada de 19/08 (Quarta) encerrada automaticamente.
- **TESTE 2 (Não abrir antes):** SUCESSO. Rodadas de 25/08 e 26/08 criadas como `scheduled`.
- **TESTE 3 (Abertura):** VALIDADO. O job `process_event_openings` processa aberturas baseadas em `opens_at <= now()`.
- **TESTE 4 (Duplicidade):** SUCESSO. Execuções repetidas não criam rodadas duplicadas.
- **TESTE 5 (Manual + Cron):** SUCESSO. Botão manual bloqueia se rodada já existir; Cron ignora se já existir.
- **TESTE 6 (Cron + Manual):** SUCESSO. Se o Cron criar primeiro, o botão manual no frontend informa a existência.
- **TESTE 7 (Turmas Independentes):** SUCESSO. Configurações de Terça, Quarta e Quinta são isoladas.

## 12. Integridade de Regras
**Confirmado:** Nenhuma regra atual de inscrição, lista principal, promoção de reserva, rateio ou ocorrência foi modificada. A alteração focou apenas no fluxo de status do Evento (Criação -> Agendado -> Aberto -> Finalizado).

**Status Final:** Automação ativa e rodada de 19/08 já reconciliada e encerrada. Próximas rodadas de Terça e Quarta já foram criadas automaticamente.
