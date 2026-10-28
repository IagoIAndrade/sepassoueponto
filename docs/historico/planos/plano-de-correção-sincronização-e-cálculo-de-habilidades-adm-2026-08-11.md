# Plano de Correção: Sincronização e Cálculo de Habilidades (Admin vs Mobile)

Esta etapa visa unificar a lógica de cálculo de nível, corrigir o tratamento da nota 0 como válida e sincronizar a exibição da posição informada pelo jogador no painel administrativo.

## Mudanças Técnicas

### 1. Centralização da Lógica de Cálculo
- **Arquivo:** `src/lib/skills.ts`
- **Ação:** Refatorar `isEvaluated` e `overallLevel` para garantir que `0` seja considerado uma nota válida e que a detecção de "avaliado" seja rigorosa (não nulo/indefinido).
- **Ação:** Garantir que `overallLevel` retorne `null` ou um valor específico quando não avaliado, para evitar que o Admin exiba `0,0` erroneamente para jogadores sem notas.

### 2. Correção de Dados no Backend (Admin)
- **Arquivo:** `src/lib/admin.functions.ts`
- **Ação:** Em `admin_list_player_skills`, garantir que as notas `0` do banco sejam preservadas e não convertidas em `null`.
- **Ação:** Incluir a `self_rating` (autoavaliação) no retorno da lista de habilidades se necessário, ou garantir que o modal a carregue corretamente.

### 3. Ajustes na Interface Administrativa (SkillsTab)
- **Arquivo:** `src/components/admin-skills-tab.tsx`
- **Ação:** Atualizar o `SkillDialog` para separar visualmente a **Autoavaliação do Jogador** da **Avaliação Técnica**.
- **Ação:** Exibir a posição e altura informadas pelo jogador na coluna da autoavaliação.
- **Ação:** Corrigir o cálculo em tempo real no modal para usar a função centralizada.
- **Ação:** Garantir que o badge na listagem reflita corretamente os novos critérios de cálculo (mostrando AUTO e TÉCNICO quando disponíveis).

### 4. Validação de Cenários (Testes)
- **Caso A (4,4,3,3,3,3,4,4):** Deve resultar em 3,5 (ou o valor exato do mobile).
- **Caso B (5,5,5,5,0,5,5,0):** Deve resultar no cálculo real (aprox. 3,75 com pesos padrão), não 0,0.
- **Caso C (Todos 0):** Deve resultar em 0,0 (Avaliado).
- **Caso D (Todos null):** Deve resultar em "Não avaliado".

## Impacto no Usuário
O administrador passará a ver dados precisos que coincidem com o que o jogador vê em seu celular. A posição informada pelo jogador será visível, facilitando a atribuição da posição oficial pelo admin. Erros de cálculo que "zeravam" notas baixas serão eliminados.
