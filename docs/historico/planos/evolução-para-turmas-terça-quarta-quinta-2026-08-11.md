# Evolução para Turmas (Terça / Quarta / Quinta)

## Análise da estrutura atual

O sistema hoje é single-tenant "quarta-feira":

- **Banco**: `app_settings` (linha única de configuração), `volleyball_events` (rodadas), `registrations`, `teams`/`team_members`, `player_incidents`, `player_blocks`, `event_attendance`, `players` (+ `player_sessions`, login por WhatsApp/PIN com cookie HttpOnly), `equipment_funds` + `fund_participants` + `fund_payments` + `fund_participant_players`, `user_roles` (admin via `has_role`).
- **Acesso**: todas as tabelas com RLS "negar tudo" e acesso exclusivamente via ~70 RPCs `SECURITY DEFINER` (`get_public_*`, `internal_*`, `admin_*`). O frontend nunca faz query direta — chama server functions em `src/lib/*.functions.ts` que usam o cliente admin.
- **Frontend**: `src/routes/index.tsx` (1.676 linhas, página pública) e `src/routes/_admin/admin.tsx` (4.657 linhas, painel com abas Lista/Jogadores/Ocorrências/Times/Rateio/Config).

Consequência importante: como todo o acesso passa por RPCs, o isolamento por turma é implementado **dentro das RPCs** (que já validam admin/sessão), não por novas policies por linha. As policies atuais (deny-all + Data API fechada) continuam sendo a proteção correta.

## Estrutura proposta

Nova tabela `groups` (turmas) — `id`, `slug`, `name`, `active`, `sort_order`.
`app_settings` ganha `group_id` (uma linha de configuração por turma, com todos os campos operacionais já existentes: local, horários, weekdays, limite, penalidades, prioridade, regras).

Colunas `group_id` adicionadas a: `volleyball_events`, `player_incidents`, `player_blocks`. Rodada continua sendo a chave de `registrations`/`teams`/`event_attendance`, então essas herdam a turma pela rodada (sem coluna redundante).

Vínculo jogador↔turma: `player_groups` (`player_id`, `group_id`). Cadastro de jogador permanece único.

Rateio: `equipment_funds` ganha `scope` (`global` | `group`) e tabela `fund_groups` (fund_id, group_id) para o caso específico. O rateio atual "Bola - Rede - Cabo de Aço - 2026" vira **global**, sem duplicação.

Ocorrências: `player_incidents.scope` (`group` | `global`); bloqueios gerados herdam o escopo, e `internal_is_blocked` passa a receber a turma.

## Migração (sem perda de dados)

1. Criar `groups` com terça/quarta/quinta.
2. Backfill: todos os `volleyball_events`, incidentes e bloqueios existentes → quarta.
3. `app_settings` atual → linha de quarta; clonar seus valores operacionais para terça e quinta, ajustando apenas `event_weekday` (2 e 4) e `open_weekday`. Edição depois é independente.
4. `player_groups`: todos os jogadores atuais vinculados a quarta.
5. Fundo atual marcado como `global`.
6. Nenhum DELETE, nenhum ID alterado, nenhum jogador/pagamento duplicado.

## Atualização de RPCs

Assinaturas ganham `p_group_id` (ou derivam a turma da rodada), preservando comportamento:

- Públicas: `get_public_settings`, `get_public_current_event`, `get_public_registrations`, `get_public_teams`, `get_public_fund_summary`, `get_public_fund_player_statuses`, `get_my_fund_status` (+ nova `get_public_groups` com resumo por aba: inscritos/limite/status).
- Jogador: `internal_join_event`, `internal_leave_registration_v2`, `internal_search_players`, `internal_get_my_registrations`, `internal_is_blocked`, `internal_player_is_paid_up` (prioridade considera só rateios aplicáveis à turma: globais + da turma).
- Admin: `admin_list_events`, `admin_preview_next_event`, `admin_create_next_event_v2`, `admin_set_event_status`, `admin_move`, `admin_remove_registration`, `admin_save_teams`, `admin_upsert_fund_config`, listagens de participantes/pagamentos, incidentes, `admin_add_player` (com turmas), e novas `admin_set_player_groups`, `admin_list_groups`.

Todas continuam `SECURITY DEFINER` com `has_role(auth.uid(),'admin')` para as `admin_*` e validação de sessão via token para as `internal_*`. Validações novas: rodada precisa pertencer à turma informada; pagamento precisa pertencer a fundo aplicável; incidente precisa referenciar rodada da mesma turma; `unique (group_id, event_date)` em rodadas.

## Frontend

**Público (`src/routes/index.tsx`)**: barra de abas fixa acima do card "Próximo jogo" (amarelo = ativa, azul-escuro = demais, scroll horizontal no mobile), com contador `14/18 · Aberta`. Turma escolhida persistida em `localStorage`; fallback na ordem pedida (última escolha → lista aberta → jogo mais próximo → próxima com jogo → quarta). Subtítulo dinâmico a partir das configurações da turma. Todo o conteúdo abaixo (lista, reserva, times, regras, prioridade, botão entrar, rateio) passa a ser derivado da turma ativa. Estado vazio por turma.

**Admin (`src/routes/_admin/admin.tsx`)**: mesmo seletor entre o cabeçalho e as abas existentes, turma ativa em destaque forte. Estado `groupId` propaga para todas as queries/mutations. Títulos, confirmações e toasts passam a nomear a turma ("Criar rodada de terça-feira", "Configurações da terça-feira salvas"). Aba Jogadores ganha filtro Todos/Terça/Quarta/Quinta e seção "Turmas em que participa" no menu de ações. Ocorrências ganham coluna Turma + abrangência + filtro. Rateio ganha filtro Todos/Compartilhados/por turma e seleção de abrangência ao criar. Config mostra "Editando configurações de: X" com aviso de alterações não salvas ao trocar de turma.

Sem redesign: mesmos tokens, cards, fontes e espaçamentos.

## Ordem de execução

1. Migração 1 — `groups`, `player_groups`, `fund_groups`, colunas novas, backfill para quarta, clonagem de config, índices/uniques.
2. Migração 2 — reescrita das RPCs públicas e de jogador com `p_group_id`.
3. Migração 3 — reescrita das RPCs administrativas + novas de turma/jogador-turma/rateio por escopo.
4. Server functions (`src/lib/public.functions.ts`, `admin.functions.ts`, `players.functions.ts`) — tipos e parâmetros.
5. Componente `GroupTabs` compartilhado + integração na página pública.
6. Integração no painel administrativo (aba a aba).
7. Validação dos fluxos listados no pedido.

## Notas técnicas

- Rollout compatível: as RPCs recebem `p_group_id` com default para a turma "quarta" enquanto o frontend é migrado, evitando janela de quebra; o default é removido ao final.
- `admin_create_next_event_v2` / `internal_compute_next_round` passam a ler `event_weekday`/`open_weekday` da configuração da turma.
- Nenhum dado de demonstração será criado; terça e quinta nascem sem rodadas e sem jogadores vinculados.
