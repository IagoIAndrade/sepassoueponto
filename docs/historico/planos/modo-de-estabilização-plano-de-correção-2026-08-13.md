# MODO DE ESTABILIZAÇÃO - PLANO DE CORREÇÃO

Este plano foca exclusivamente na correção de regressões e estabilização dos fluxos centrais.

## 1. Correção de ADMIN_ADD (Problema 1)
- **Ação:** Criar nova migration para garantir `GRANT EXECUTE` em todas as RPCs administrativas (`admin_add_player`, `admin_remove_registration_v3`, `admin_search_players`).
- **Ação:** Ajustar `admin_add_player` para ser mais resiliente e retornar erros contextuais (ex: 'main_full', 'already_registered').
- **Ação:** Atualizar `AddPlayerModal.tsx` para exibir erros específicos em vez do toast genérico.

## 2. Unificação da Fonte de Verdade para Acesso (Problema 2)
- **Ação:** Centralizar a verificação de acesso no backend dentro de `get_current_event_full`.
- **Ação:** Garantir que o frontend use apenas os dados vindos de `eventQ` para decidir se exibe "ACESSO RESTRITO".
- **Ação:** Corrigir policies que comparam `player_id` com `auth.uid()`, alterando para `user_id = auth.uid()` ou usando a função `has_role`.

## 3. Isolamento do Push e Erros Genéricos (Problema 3)
- **Ação:** Envolver chamadas de Push (Service Worker e Server Fns) em blocos `try/catch` silenciosos na Home.
- **Ação:** Remover toasts automáticos de falhas de Push durante o carregamento.
- **Ação:** Garantir que falhas na criação de notificações ou Push Outbox no banco não abortem a transação principal (JOIN/LEAVE).

## 4. Auditoria de Identidade (Bug Crítico)
- **Ação:** Revisar todas as migrations recentes e corrigir o uso de `auth.uid()`.
- **Regra:** `player_id` é o ID na tabela `players`. `auth.uid()` é o ID na tabela `auth.users`. Nunca compará-los diretamente.

## Matriz de Testes Obrigatórios (A até J)
Serão executados testes manuais e via logs para validar:
- Login Mobile sem erro genérico.
- Acesso aprovado/negado consistente entre Home e Lista.
- Admin adicionando jogador manualmente (Bruno Narciso).
- Jogador entrando/saindo da lista.
- Promoção automática de reserva funcionando.
- Sistema operando normalmente mesmo com Push/Service Worker desativado.

## Resumo Técnico das Alterações
- **Migrations:** Nova migration incremental para GRANTS e correção de policies.
- **Frontend:** Refatoração de `src/routes/index.tsx` (seção Push e Acesso) e `AddPlayerModal.tsx`.
- **Backend:** Ajustes em `src/lib/public.functions.ts` e `src/lib/admin.functions.ts`.

---
*Nenhuma nova funcionalidade será adicionada.*
