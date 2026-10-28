# Plano de Estabilização: Sincronização Schema/Código (Inscrições e Ocorrências)

A aplicação apresenta incompatibilidades entre o código (RPCs e Server Functions) e o schema real do banco de dados publicado, resultando em erros críticos ao entrar ou sair de listas.

## Auditoria de Schema Atual

| Item | Código Espera | Banco Possui | Estado |
| :--- | :--- | :--- | :--- |
| **responsible_player_id** | `public.registrations` | **NÃO EXISTE** | 🔴 Incompatível |
| **registered_by_player_id** | - | `public.registrations` | 🟢 Disponível |
| **Tabela de Ocorrências** | `public.incidents` | **NÃO EXISTE** | 🔴 Incompatível |
| **Tabela Real** | - | `public.player_incidents` | 🟢 Disponível |

## Causa Raiz

1.  **ERRO 1 (SAIR):** A RPC `internal_leave_registration_v2` tenta inserir em `public.incidents`, mas a tabela correta no banco é `public.player_incidents`.
2.  **ERRO 2 (ENTRAR):** A RPC `internal_join_event` tenta inserir na coluna `responsible_player_id`, mas a coluna canônica no banco é `registered_by_player_id`.

## Ações Propostas

### 1. Correção no Banco de Dados (PostgreSQL)

*   **RPC `internal_join_event`:** Refatorar para utilizar `registered_by_player_id` em vez de `responsible_player_id`.
*   **RPC `internal_leave_registration_v2`:** Refatorar para utilizar a tabela `public.player_incidents` e mapear as colunas corretamente (`incident_type` em vez de `type`, `occurred_at` em vez de `created_at`).
*   **Grants:** Garantir permissões de execução para `authenticated` e `service_role`.

### 2. Correção no Frontend/Server Functions

*   **`src/lib/public.functions.ts`:** Atualizar a chamada da RPC `internal_join_event` (em `join_other`) para garantir que o parâmetro renomeado no backend (se houver mudança de assinatura) seja respeitado, ou simplesmente manter a compatibilidade se a assinatura da RPC for mantida com o nome antigo apenas internamente. *Decisão: Manteremos o nome do parâmetro na assinatura da RPC para evitar quebra no TS, mas mudaremos o INSERT interno para a coluna correta.*

## Plano de Testes (Regressão)

*   **Teste 1 (Join Self):** Inscrição direta do jogador logado (17/18).
*   **Teste 2 (Leave Normal):** Saída dentro do prazo (16/18).
*   **Teste 3 (Leave Tardia):** Saída fora do prazo -> Confirmação -> Criação de registro em `player_incidents`.
*   **Teste 4 (Convidado):** Adicionar acompanhante -> Verificar vínculo via `registered_by_player_id`.
*   **Teste 5 (Admin Add):** Adição via painel administrativo.
*   **Teste 6 (Promoção):** Saída de titular -> Promoção automática do reserva #1.

## Detalhes Técnicos

*   Uso de `SECURITY DEFINER` nas RPCs para garantir que as operações de promoção e incidentes tenham as permissões necessárias.
*   Mapeamento de colunas de `player_incidents`:
    *   `incident_type` = 'Retirada fora do prazo'
    *   `occurred_at` = `v_now`
    *   `status` = 'pending'
