# Relatório de Validação Final: Pontos Críticos

Esta análise técnica aborda os 3 pilares de risco identificados pós-redesign.

---

# 1 — LISTA: `created_at` x `position`

Foi identificada uma redundância na lógica de ordenação da `ListTab.tsx`.

*   **Comportamento Detectado:** O `useEffect` ordena localmente por `created_at`. No entanto, a query original em `admin.functions.ts` já retorna os dados ordenados por `created_at` e `id`.
*   **Conflito com `position`:** A movimentação manual via Drag & Drop dispara `admin_move_registration`, que no servidor altera o campo `position_number`.
*   **Diagnóstico:** Como o frontend ordena explicitamente por `created_at` em um `useEffect`, qualquer movimentação manual que altere a ordem lógica mas não os timestamps de criação será **sobrescrita visualmente** na próxima atualização de estado ou refetch.
*   **Impacto:** **REGRESSÃO CRÍTICA**. A persistência de `position` no banco de dados é ignorada pelo critério de ordenação do frontend.

# 2 — RATEIO: AÇÃO `QUITAR`

A função `handleMarkAsPaid` foi analisada quanto à segurança financeira.

*   **Cenário A/B:** Validado. A função calcula `Math.abs(Number(participant.balance))` e envia como valor único de pagamento. Se o saldo for R$ 20,00, ela adiciona exatamente R$ 20,00, levando o saldo a R$ 0,00.
*   **Cenário C (Duplicação):** **SEGURANÇA PARCIAL**. Existe um estado `busy` que desabilita o botão via `disabled={busy}` (Linha 291). Isso previne cliques múltiplos durante a requisição.
*   **Cenário D (Mudança de Saldo):** Risco baixo, pois a operação é atômica no servidor, mas se o saldo mudar no banco entre o render e o clique, o valor enviado será o do momento do render.
*   **Cenário E (Já Pago):** Validado. O botão `QUITAR` (CheckCircle2) só é renderizado se `Number(item.balance) < 0` (Linha 285).
*   **Diagnóstico:** **VALIDADO**. O uso de `busy` e a trava condicional de renderização garantem a segurança básica da operação.

# 3 — CONFIGURAÇÕES: `Number`, `null`, vazio e zero

A lógica do `handleSave` em `SettingsTab.tsx` foi auditada para o campo `max_waitlist`.

*   **Campo Vazio:** Validado. Se `formData.max_waitlist` for `""`, `null` ou `undefined`, o payload envia `max_waitlist: null` (Linha 108), o que no banco significa "Ilimitado".
*   **Valor 0:** No banco de dados do projeto, `0` significa zero vagas de reserva (bloqueio de fila). O código preserva isso ao converter `Number("0")`, que resulta em `0` e é enviado no payload.
*   **Texto Inválido:** Validado. Existe um check `!Number.isFinite(parsed)` que dispara toast de erro e interrompe o salvamento.
*   **Rastreabilidade:**
    *   `VALOR DIGITADO: ""` → `VALOR ENVIADO: null` → `PERSISTIDO: null` → `RELOAD: ""` (Input placeholder ∞).
    *   `VALOR DIGITADO: "0"` → `VALOR ENVIADO: 0` → `PERSISTIDO: 0` → `RELOAD: 0`.
*   **Diagnóstico:** **VALIDADO**. A sanitização manual no handler resolveu a inconsistência de tipos entre o input (string) e o banco (int).

---

# RESULTADO FINAL

## ⚠️ PROBLEMA ENCONTRADO

### 1. Conflito de Ordenação na Lista
1.  **Arquivo:** `src/routes/_admin/tabs/ListTab.tsx`
2.  **Função:** `useEffect` de ordenação (Linha 124).
3.  **Causa:** Força ordenação por `created_at` no frontend, ignorando a ordem de `position_number` / `position` definida pelo admin.
4.  **Impacto:** Jogadores movidos manualmente voltam para suas posições cronológicas originais após qualquer atualização de dados.
5.  **Correção Recomendada:** Alterar o critério de ordenação do `sort` para utilizar `position_number` (ou o campo equivalente retornado pela RPC enriquecida) como critério primário, mantendo `created_at` apenas como fallback.

---

Aguardando autorização para aplicar a correção do item 1.

---

# RELATÓRIO DE VALIDAÇÃO: PAINEL FINANCEIRO MOBILE E FLUXOS AVALIADOS

## Itens Validados por Inspeção de Código
- **Turma e data da rodada:** O `FinanceDialog` agora extrai o nome do grupo e a data do evento dos dados contextuais e exibe no cabeçalho do modal.
- **Ícones de fechamento:** Removido o fechamento customizado `<X>` do `DialogHeader` e removida a classe `[&>button]:hidden` que ocultava o botão nativo. O botão "Voltar" inferior foi mantido. Agora existe apenas 1 ícone no topo e o botão na base.
- **Diferenciação de status sem considerar R$ 0,00:** A lógica em `getStatusInfo` exige que `myStatus.total_paid > 0` para classificar como "Pago" ou "Pendente (Parcial)". Caso contrário, mesmo com status `in_full`, se `total_paid` for 0, é classificado como "Sem cobrança".
- **Mensagem "Sem cobrança nesta rodada":** Implementada a verificação `hasFund`, exibindo um placeholder amigável.
- **Rótulos e Moeda (BRL):** O resumo total, arrecadado, valor devido individual e saldo pendente agora passam pelo formatador `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.
- **Diferenciação de estados:** O componente usa `isLoading` (spinner), `isError` (feedback de falha na consulta, não convertendo mais falha em R$0,00) e os estados de sucesso.
- **Rolagem mobile:** A classe `overflow-y-auto no-scrollbar` aliada a `max-h` garante que os dados sejam visualizados de forma completa em telas menores (como 320px).

## Pendências (Testes Manuais Não Executados)
Como esta é uma validação estática de código, os seguintes testes **ficaram pendentes de validação manual por humano ou automação e2e no navegador real**:
- Testar as resoluções de tela específicas (320, 360, 390 e 430px) para conferir possíveis quebras visuais e ausência de rolagem horizontal.
- Conferir comportamento com o teclado virtual aberto em formulários no mobile (como nome longo e lista cheia).
- Garantir de fato a ausência de botões cobertos nas telas menores.
- Confirmar a persistência em tempo real e a reabertura de sessão mantendo o estado correto de autoavaliação e perfil do jogador.
- Testar fisicamente os fluxos completos de Início, acesso, cadastro completo, inscrição, retirada e visualização nas demais telas (Lista, Times, Minhas Inscrições, etc.).
- Verificação definitiva do console do navegador no fluxo de ponta a ponta.

## Correções de Build
- Resolvido erro TS2345 no painel de autoavaliação (fallback de `null` para os defaults).
- Resolvidos erros de tipagem em `src/routes/index.tsx` (tipagem da RPC `internal_join_event_v3` e da prop `position`).
- A checagem estática no componente central de perfis agora compila corretamente.
