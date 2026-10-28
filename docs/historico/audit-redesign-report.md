# Auditoria Técnica: Central da Rodada (Pós-Redesign)

Esta auditoria foca na integridade funcional após o redesign visual da Central da Rodada.

---

## 1. LISTA PRINCIPAL
A nova visualização compacta utiliza badges (`01`, `R01`) que são meramente derivativos do índice do array ordenado, sem impactar a persistência.

*   **Evidência:** A `PlayerRow` calcula o badge usando `totalIdx` e `mainLimit`.
*   **Comportamento:**
    *   `position` persiste a ordem via `admin_move_registration`.
    *   Ordenação cronológica (`created_at`) é forçada no frontend via `useEffect` em `ListTab.tsx`.
    *   Remoção/Promoção: Utiliza `admin_remove`, que dispara a reordenação em duas fases no banco (evitando conflito `uq_reg_position_active`).
*   **Drag & Drop:** Mantido funcional via `@dnd-kit`, disparando `admin_move_registration`.

## 2. DROPDOWN DE POSIÇÃO
O "dropdown simplificado" é apenas visual (substituiu botões grandes por um seletor compacto na linha).

*   **Natureza:** **VISUAL**.
*   **Persistência:** Continua disparando `admin_update_player_primary_position`.
*   **Relato:** Jogadores sem posição agora exibem `POS?` em cinza claro, melhorando a identificação de cadastros incompletos sem alterar a lógica de `null`.

## 3. TIMES
A refatoração da `PlayerRow` nos Times reutiliza a lógica central de `overallLevel`.

*   **Fonte do Overall:** `src/lib/skills.ts` -> função `overallLevel`.
*   **Lógica:** Média ponderada (0-5) das 8 notas técnicas. Se nulo, retorna `null`.
*   **Jogadores sem avaliação:** Exibem "—", tratado corretamente em `fmt1`.
*   **Equilíbrio:** O algoritmo `distributePlayers` em `src/lib/skills.ts` NÃO foi alterado.

## 4. ORGANIZADORES
O destaque visual de "Top 3" é apenas uma aplicação de CSS condicional (`idx < 3`).

*   **Natureza:** **VISUAL**.
*   **Persistência:** A ordem real é mantida via `order` na tabela `group_players` e manipulada por `admin_reorder_organizers`.

## 5. OCORRÊNCIAS
As estatísticas (No-Shows, Saídas) são agregações em tempo real do array retornado por `admin_list_incidents`.

*   **Campos:** Utiliza `incident_type` (`no_show` / `late_leave`).
*   **Agregação:** Realizada via `useMemo` no frontend. Nenhuma nova regra ou classificação foi criada no banco.

## 6. RATEIO (Ações Rápidas)
A ação **QUITAR** (`handleMarkAsPaid`) é um atalho funcional.

*   **Significado:** Dispara `admin_add_fund_payment_direct` com o valor exato do saldo devedor (`Math.abs(item.balance)`).
*   **Função:** Reutiliza operações existentes. Não introduz nova lógica financeira.

## 7. RETIRADAS
Os status "No Prazo" e "Atrasado" são calculados via badge condicional.

*   **Lógica:** Baseia-se no campo `deadline_status` retornado pelo backend (que já calculava isso via trigger/função de auditoria).
*   **Isolamento:** A query `admin_list_withdrawals` filtra por `group_id` e `event_id`, garantindo isolamento total por rodada.

## 8. CONFIGURAÇÕES
A "validação robusta" refere-se à coerção explícita para `Number` e tratamento de `null` no `handleSave`.

*   **Reservas:** O campo `max_waitlist` preserva a lógica de que "Vazio" ou `null` = Ilimitado.
*   **Mudanças:** Apenas sanitização de input antes do envio para a RPC `admin_update_settings`.

---

# ALTERAÇÕES TÉCNICAS (REDESIGN)

| TIPO | RESULTADO | DETALHE |
| :--- | :--- | :--- |
| **BANCO** | NÃO | Nenhuma migration criada. |
| **RPC** | NÃO | Nenhuma lógica alterada; apenas consumo. |
| **RLS** | NÃO | Nenhuma policy alterada. |
| **QUERY** | NÃO | Reutilização das queries existentes. |
| **HANDLERS** | SIM | Ajustes de UI em `handleSave` e `handleMarkAsPaid`. |

---

# RELATÓRIO FINAL DE AUDITORIA

| ÁREA | VISUAL OK | FUNCIONAL OK | REGRESSÃO | OBSERVAÇÃO |
| :--- | :--- | :--- | :--- | :--- |
| Navegação | ✅ | ✅ | NÃO | Sidebar numerada funcional. |
| Lista | ✅ | ✅ | NÃO | Ordenação e badges corretos. |
| Organizadores | ✅ | ✅ | NÃO | Top 3 visual apenas. |
| Ocorrências | ✅ | ✅ | NÃO | Agregações corretas. |
| Times | ✅ | ✅ | NÃO | D&D e Overall preservados. |
| Rateio | ✅ | ✅ | NÃO | Ações rápidas estáveis. |
| Configurações | ✅ | ✅ | NÃO | Persistência de null ok. |
| Retiradas | ✅ | ✅ | NÃO | Isolamento por rodada ok. |
| Troca Turmas | ✅ | ✅ | NÃO | Contexto limpo entre abas. |

### ✅ REDESIGN SEGURO
Nenhuma regressão funcional encontrada. A Central da Rodada está operando com a lógica original sob a nova interface.
