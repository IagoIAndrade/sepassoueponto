# Auditoria de Acessibilidade - SE PASSOU, É PONTO

## 1. Problemas Críticos
- **Navegação por Teclado (Falta de Visibilidade de Foco):** O componente `Button` do shadcn possui `focus-visible:outline-none`, mas não há uma indicação visual forte o suficiente de foco em muitos componentes customizados, dificultando o uso por teclados em Desktop.
- **Hierarquia de Headings:** Uso inconsistente de tags `<h1>` a `<h6>`. Algumas seções importantes usam `<p>` estilizado em vez de headings semânticos, quebrando a navegação por screen readers.
- **Labels em Botões de Ícone:** Botões como o de fechar modais ou seletores de turma no mobile muitas vezes não possuem `aria-label`, impossibilitando usuários cegos de entenderem a ação.

## 2. Problemas de Severidade Alta
- **Contraste de Texto:** Algumas combinações de `brand-silver` (Slate 400) sobre `brand-background` ou `brand-surface` não atingem o ratio de 4.5:1 exigido pela WCAG AA para textos pequenos.
- **Áreas de Toque (Mobile):** Botões pequenos (como os seletores de turma compactos ou abas de navegação) estão no limite ou abaixo de 44x44px de área de ativação efetiva.
- **Textos Muito Pequenos:** Uso frequente de `text-[9px]` e `text-[10px]`, que são difíceis de ler para pessoas com baixa visão. O mínimo recomendado é 12px (0.75rem).

## 3. Problemas de Severidade Média
- **Aria-current:** A navegação mobile (`MobileNavBar`) e as abas (`SectionNav`) não utilizam consistentemente `aria-current="page"` ou `aria-current="true"` para indicar o estado ativo.
- **Fallbacks de Avatar:** Embora existam fallbacks de iniciais, a descrição `alt` do avatar deve ser mais descritiva (ex: "Foto de Perfil de [Nome]").
- **Foco em Modais:** O `Dialog` do Radix (usado via shadcn) trata bem o trap de foco, mas alguns modais customizados podem não estar limpando o foco corretamente ao fechar.

## 4. Problemas de Severidade Baixa
- **Redução de Movimento:** O sistema já respeita `prefers-reduced-motion` no CSS global, mas algumas animações de entrada (`animate-fade-in`) poderiam ser otimizadas.
- **Descrições de Status:** Badges de status (Inscrito, Pago, etc) dependem muito de cor. Adicionar ícones ou labels textuais mais explícitos ajuda usuários daltônicos.

---

# Plano de Correção (Safe UI Fixes)

## Ações Propostas:
1. **Reforço de Foco:** Atualizar `src/styles.css` para garantir que o foco via teclado seja sempre visível (ex: anel de ouro da marca).
2. **Semântica e Headings:** Ajustar componentes de título em `src/routes/index.tsx` e `src/routes/_admin/admin.tsx`.
3. **Aria-Labels:** Adicionar labels em botões críticos de navegação e ações.
4. **Tamanhos de Fonte:** Elevar textos críticos de 9px/10px para pelo menos 11px/12px onde o layout permitir.
5. **Melhoria de Contraste:** Ajustar opacidades de cores secundárias para melhor legibilidade.
6. **Navegação Mobile:** Adicionar atributos ARIA na `MobileNavBar`.
