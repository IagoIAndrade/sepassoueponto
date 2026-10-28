# Plano de Melhoria UX/UI Mobile — SE PASSOU, É PONTO

Este plano visa otimizar a hierarquia de informações, clareza e navegação nas telas mobile, mantendo a integridade total de todas as regras de negócio e funcionalidades existentes.

## Componentes a serem Criados/Refatorados
*   `EventContextCard.tsx`: Novo componente compacto para exibir data, horário e resumo de vagas.
*   `MobileNavBar.tsx`: Padronização de ícones, estados e área de toque.
*   `src/routes/index.tsx`: Reorganização da hierarquia visual nas abas Início, Rateio, Times e Lista.

## Detalhes Técnicos
*   **Header**: Alteração do texto "ENTRAR" para "ACESSAR" para usuários deslogados.
*   **Seletor de Turma**: Ajuste de padding, gap e contraste, mantendo a lógica de cadeados.
*   **Minha Situação**: O componente `PlayerEventStatus` será posicionado com maior destaque no topo de cada aba.
*   **Notificações**: Redução do card de convite para Push em um formato mais discreto.
*   **Listas**: Inclusão de resumo visual (18 Titulares / 2 Reservas) e destaque para o jogador atual ("VOCÊ").
*   **Hierarquia**: Aplicação de um sistema consistente de `padding: 16px`, `gap: 12px` e tipografia Oswald para títulos.

## Auditoria de Segurança
*   Nenhuma RPC, Trigger, RLS ou política de banco será alterada.
*   Os handlers de clique (`doJoinSelf`, `doLeaveSelf`, `setGroupId`) serão preservados exatamente como estão.
*   A comunicação com o backend (TanStack Start / Supabase) permanece intocada.
