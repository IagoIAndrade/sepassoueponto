# Plano de Refinamento Visual PREMIUM: SE PASSOU, É PONTO

Este plano visa elevar a qualidade estética e a usabilidade do sistema, transformando-o em um produto profissional com identidade visual consistente, sem comprometer a funcionalidade esportiva e ágil.

## 1. Design System & Tokens (Escala 8pt)
- **Cores**: Refinar a paleta `brand-*` para garantir contrastes WCAG AA e profundidade visual (usando variações de opacidade e tons).
- **Espaçamento**: Padronizar margens e paddings usando a escala 8pt (4, 8, 12, 16, 24, 32, 48px).
- **Radius**: Unificar bordas arredondadas (12px para mobile, 8px para cards, 4px para inputs pequenos).
- **Shadows**: Implementar sombras sutis e multinível para criar profundidade sem pesar o layout.
- **Tipografia**: Consolidar o uso de **Oswald** (Display) para títulos/números e **Inter** (Sans) para corpo de texto, com tamanhos mínimos de 12px.

## 2. Hierarquia e Informação
- **Dashboard Jogador**: Reestruturar o header para mostrar imediatamente a situação da inscrição e o status da próxima turma.
- **Cards de Ação**: Destacar ações primárias (Entrar na Lista) com gradientes discretos e sombras de foco.
- **Empty States**: Criar placeholders visuais agradáveis para listas vazias ou rodadas não preparadas.

## 3. Padronização de Componentes (UI)
- **Button**: Unificar variantes (Primary Gold, Secondary Blue, Outline Silver) com estados de `:active` e `:disabled` claros.
- **Input/Select**: Estilizar com foco consistente em `brand-gold` e fundo `brand-surface-elevated`.
- **Dialog/Modal**: Garantir paddings consistentes e fundos com `backdrop-blur` suave.
- **Avatar**: Padronizar tamanhos e bordas de status (Inscrito, Pendente, Admin).

## 4. Otimização Mobile & Admin
- **Mobile**: Reduzir ruído visual no header e garantir áreas de toque de 44px em todos os botões.
- **Admin**: Aumentar a densidade de informação nas listas, mas manter espaçamentos claros entre colunas. Sticky headers em todas as abas.

## 5. Motion & Feedback
- **Transições**: Adicionar `duration-200` e `ease-in-out` em trocas de abas e abertura de modais.
- **Feedback**: Toasts de sucesso/erro integrados à paleta de cores.

## Detalhes Técnicos
- Edições centralizadas em `src/styles.css` usando `@theme` do Tailwind v4.
- Atualização de componentes shadcn em `src/components/ui/` para refletir os novos tokens.
- Refatoração de seções críticas em `src/routes/index.tsx` e `src/routes/_admin/admin.tsx`.
