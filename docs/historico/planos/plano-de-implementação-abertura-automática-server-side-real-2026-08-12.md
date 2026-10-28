# Plano de Implementação - Abertura Automática Server-Side Real

Este plano descreve a transição do mecanismo de abertura de lista baseado no frontend para uma automação robusta server-side usando Supabase Cron (`pg_cron`) e uma lógica SQL canônica e atômica.

## Objetivos
- Automação server-side que funciona independentemente de usuários logados.
- Garantia de prioridade absoluta para organizadores.
- Ordenação determinística baseada em `created_at` e `organizer_order`.
- Prevenção de concorrência e duplicidade.

## Arquitetura Técnica

### 1. Extensões do Banco de Dados
- Garantir que `pg_cron` esteja disponível e ativo.

### 2. Nova Função SQL Canônica
Criar `public.internal_process_event_opening(p_event_id uuid)` que será a única fonte de verdade para a abertura:
1. Adquire lock consultivo transacional (`lock_event`).
2. Verifica se o status é `scheduled` e o horário de abertura chegou.
3. Se sim:
   - Identifica organizadores da turma (`player_groups` onde `is_organizer = true`).
   - Insere-os um a um na tabela `registrations` com timestamps `opens_at + interval 'X milliseconds'` onde X é o `organizer_order`.
   - Atualiza o status do evento para `open`.
   - Marca `organizers_auto_enrolled_at = now()` para evitar re-processamento.
4. Tudo em uma única transação atômica.

### 3. Rotina de Processamento Global
Criar `public.internal_process_due_event_openings()`:
- Busca todos os eventos `scheduled` onde `opens_at <= now()`.
- Chama `internal_process_event_opening(id)` para cada um.
- Utiliza `FOR UPDATE SKIP LOCKED` para evitar que múltiplas execuções do cron processem o mesmo evento simultaneamente.

### 4. Agendamento (Cron)
- Configurar tarefa no `pg_cron` para executar `SELECT public.internal_process_due_event_openings();` a cada 1 minuto.

### 5. Ajustes no Frontend e RPCs
- Refatorar `get_current_event_full` no `src/lib/public.functions.ts` para chamar a função SQL canônica em vez de ter lógica própria.
- Garantir que o botão "Abrir Lista" do Admin chame a mesma lógica.
- Auditar `internal_join_event` para garantir que ele respeita a transação de abertura.

### 6. Ordenação da Lista
- Confirmar que a visualização da lista utiliza `created_at ASC` como critério principal.
- Desativar dependência de `position_number` para controle de posição de organizadores se `created_at` for o padrão.

## Cronograma de Ações
1. Migração SQL: Criar funções e configurar Cron.
2. Atualização de Código: Refatorar chamadas no TypeScript.
3. Verificação: Testes de concorrência e fechamento do site.

## Segurança
- Uso de `SECURITY DEFINER` e `SET search_path` conforme padrões do projeto.
- RLS preservado (as funções internas ignoram RLS, mas o acesso a elas é controlado).

## Relatório de Conclusão
Ao final, será entregue o relatório detalhado solicitado pelo usuário.
