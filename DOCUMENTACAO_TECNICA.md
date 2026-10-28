# Documentação Técnica: SE PASSOU, É PONTO

Esta documentação reflete a arquitetura e as funcionalidades reais do projeto **SE PASSOU, É PONTO** (Vôlei), mapeadas a partir do código-fonte e do banco de dados em Agosto de 2026.

## 1. Arquitetura Geral
O sistema é uma aplicação full-stack moderna construída sobre:
- **Framework:** TanStack Start v1 (React 19 + Vite 7).
- **Backend/Banco de Dados:** Lovable Cloud (Supabase).
- **Runtime:** Edge Functions (Cloudflare Workers via TanStack Start).
- **Estilização:** Tailwind CSS v4 (Design System 8pt).
- **Comunicação:** RPCs tipadas via `createServerFn`.
- **Realtime:** Supabase Realtime para atualizações de listas e times.

## 2. Estrutura de Pastas
- `src/routes/`: Definição de rotas e páginas.
  - `_admin/`: Painel administrativo protegido.
  - `api/public/`: Endpoints abertos (webhooks/push).
- `src/lib/`: Lógica de negócio e funções de servidor (`*.functions.ts`).
- `src/components/`: Componentes UI reutilizáveis.
- `src/integrations/supabase/`: Cliente e tipos do banco de dados.
- `supabase/migrations/`: Histórico de alterações do esquema SQL.

## 3. Rotas Principais
- `/`: Área do Jogador (Dashboard, Lista, Times, Perfil).
- `/admin`: Painel Administrativo (Exige papel `admin`).
- `/admin/login`: Acesso administrativo.
- `/api/public/push-trigger`: Disparo de notificações push.

## 4. Integração Supabase
- **Tabelas Principais:**
  - `players`: Dados cadastrais e habilidades dos jogadores.
  - `groups`: Turmas (Terça, Quarta, Quinta).
  - `player_groups`: Relacionamento e status de acesso (approved, pending, rejected).
  - `volleyball_events`: Rodadas de cada turma.
  - `registrations`: Inscrições em rodadas (titulares, reservas).
  - `app_settings`: Configurações de tempo, limites e regras por turma.
  - `notifications`: Central de avisos para jogadores.
  - `player_self_ratings`: Autoavaliação técnica.
  - `incidents`: Registro de faltas e atrasos (Ocorrências).
  - `equipment_funds` & `fund_participants`: Gestão de rateio.

## 5. Fluxos Críticos

### A. Cadastro e Acesso (Jogador)
**ENTRADA:** Nome, WhatsApp, Senha (PIN), Turma desejada.
**VALIDAÇÃO:** Normalização de telefone, verificação de duplicidade, obrigatoriedade de foto.
**REGRA DE NEGÓCIO:** O jogador entra com status `pending` na turma selecionada. O acesso aos dados da rodada é bloqueado até aprovação administrativa.
**BANCO/RPC:** `player_request_group_access`.
**RESPOSTA:** Card "PENDENTE" exibido.
**ATUALIZAÇÃO DA INTERFACE:** Bloqueio de abas e botões de inscrição.

### B. Inscrição na Lista (Prioridade e Geral)
**ENTRADA:** Clique em "Entrar na Lista".
**VALIDAÇÃO:** 
1. Possui foto válida?
2. Acesso aprovado na turma?
3. Janela de tempo aberta?
**REGRA DE NEGÓCIO:** 
- **Fase Prioridade:** Apenas jogadores "Em Dia" com o rateio (isento ou pago) entram nos primeiros `priority_minutes`.
- **Fase Geral:** Aberto a todos os aprovados.
- **Titulares vs Reservas:** Os primeiros `main_limit` são titulares; o restante entra na reserva.
**BANCO/RPC:** `internal_join_event`.
**RESPOSTA:** Inscrição confirmada ou erro de prioridade.
**ATUALIZAÇÃO DA INTERFACE:** Realtime propaga a mudança para todos; toast notifica promoções da reserva.

### C. Fluxo Administrativo (Gestão de Rodada)
**ENTRADA:** Painel Admin -> Aba Lista.
**VALIDAÇÃO:** Verificação de papel `admin` via `has_role`.
**REGRA DE NEGÓCIO:** 
- Adição manual de jogadores.
- Reordenação via Drag and Drop (preservando `created_at` para ordem cronológica padrão).
- Sincronização automática de Organizadores (fixos no topo).
**BANCO/RPC:** `admin_add`, `admin_remove_registration_v3`, `admin_ensure_opening_organizers`.
**ATUALIZAÇÃO DA INTERFACE:** Atualização instantânea via Realtime.

### D. Montagem de Times
**ENTRADA:** Aba Times (Admin).
**REGRA DE NEGÓCIO:** Sorteio automático baseado em habilidades técnicas ou movimentação manual.
**BANCO/RPC:** `admin_save_teams`.
**RESPOSTA:** Notificação enviada aos jogadores: "Os times foram publicados!".

## 6. Lógica de Tempo e Timezone
- **Timezone:** Fixo em `America/Sao_Paulo`.
- **Datas:** Utiliza "Civil Date" (YYYY-MM-DD) para persistência em eventos, evitando deslocamentos.
- **RoundState:** Centraliza o cálculo dinâmico de `openAt`, `priorityEndsAt` e contagem regressiva.

## 7. Segurança e RLS
- **RLS:** Habilitado em todas as tabelas sensíveis.
- **Grants:** Privilégios explícitos para as roles `authenticated` e `service_role` (necessário para PostgREST).
- **Security Definer:** Funções RPC como `internal_sync_event_status` e `has_role` executam com privilégios de sistema para contornar recursão de RLS.

## 8. "SE VOCÊ ALTERAR ISSO, VERIFIQUE TAMBÉM..." (Dependências Críticas)

| Se você alterar... | Verifique também... |
| :--- | :--- |
| **`registrations.player_id`** | RPC `internal_join_event`, `internal_leave_registration_v2` e Políticas RLS de exclusão. |
| **`app_settings.open_time` / `open_weekday`** | Lógica de `calculateOpenAt` em `src/lib/round-state.ts` (impacta countdown e abertura). |
| **`players.avatar_url`** | RPC `confirm_avatar_upload` e lógica de Signed URLs em `get_current_event_full`. |
| **Status de um jogador no Rateio** | Cálculo de `priority_window` na RPC `internal_join_event`. |
| **Ordem de colunas em `registrations`** | O Drag and Drop no `ListTab.tsx` depende de `position_number` e `created_at`. |
| **Papéis de usuário** | Função SQL `has_role()` e o gate de rota em `src/routes/_admin/route.tsx`. |

## 9. Fotos e Storage
- **Bucket:** `player-avatars`.
- **Fluxo:** Upload via Signed URL -> Confirmação via RPC -> Validação manual no Admin.
- **Segurança:** O acesso à foto é validado pela RPC `internal_check_avatar_access` antes de gerar a URL assinada para o frontend.

---
*Documentação gerada automaticamente baseada no código-fonte real.*
