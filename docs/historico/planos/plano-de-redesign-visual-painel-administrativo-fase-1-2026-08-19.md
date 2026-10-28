# Plano de Redesign Visual — Painel Administrativo (Fase 1)

Este plano detalha a reformulação visual das áreas de **Gestão de Acessos** e **Gestão Geral** (Jogadores e Habilidades), transformando o dashboard em uma **Central Técnica** esportiva.

## 1. Auditoria e Diagnóstico
- **Contadores de Acesso:** Investigar se as categorias (Total, Pendentes, Ativos, Sem Acesso) são exclusivas ou sobrepostas.
- **Erro de Nota 0,0:** Identificar se o valor 0,0 em "Nível Técnico" ou "Autoestimado" é um problema de estado local, cálculo no frontend ou dado inconsistente no banco (especialmente quando há notas > 0 nos fundamentos).

## 2. Navegação Principal
- Refatorar o componente de abas em `src/routes/_admin/admin.tsx`.
- Novo estilo: Itens numerados (01, 02, 03) com títulos em caixa alta e descrições curtas.
- Substituir o fundo amarelo sólido por um destaque discreto (borda lateral/inferior e elevação de superfície).

## 3. Gestão de Acessos
### Solicitações (`ApprovalsTab.tsx`)
- Novo cabeçalho: "CENTRAL DE APROVAÇÕES" com contador dinâmico.
- Transformar a tabela de pendentes em Cards ricos com:
    - Foto/Avatar circular.
    - Nome em destaque (Oswald).
    - WhatsApp formatado.
    - Seletor de acesso visual (Check/Traço para cada turma).
    - Ações diretas: [APROVAR] (Primária) e [RECUSAR] (Destrutiva).

### Revisar Vínculos (`AcessosARevisarTab.tsx`)
- Renomear visualmente para "MATRIZ DE TURMAS".
- Cabeçalho compacto com indicadores de elenco.
- Grade de acesso com controles personalizados em vez de checkboxes padrão.

## 4. Gestão Geral (Jogadores e Habilidades)
### Base de Jogadores (`PlayersTab.tsx`)
- Tabela aprimorada com Sticky Header e maior contraste.
- Badge de status compacto (ATIVO, INATIVO, ADMIN).
- Integração do **PlayerDrawer** (Lateral Direita) ao clicar em um jogador.

### PlayerDrawer (Novo Componente)
- Perfil técnico completo: Posição, Altura, Foto, Notas.
- Menu de ações centralizado (Editar, Reset PIN, Tornar Admin, Desativar).
- Visualização do **Radar Técnico**.

### Habilidades Globais (`SkillsTab.tsx`)
- Alta densidade de informação: Resumo de fundamentos em grid compacto (ex: REC 4.2).
- Indicação clara de "NÃO AVALIADO".
- Destaque para "Ponto Forte" e "Desenvolver" derivados das notas.

## 5. Modal de Avaliação
- Reorganização em duas colunas (Desktop):
    - Esquerda: Autoavaliação do Jogador (Somente leitura).
    - Direita: Avaliação Técnica (Inputs de Admin).
- Substituir Sliders por seletores de nota discretos (0 a 5).
- Preview em tempo real da nota final utilizando a fórmula canônica.

## Detalhes Técnicos
- **Fórmulas:** Manter `overallLevel` de `src/lib/skills.ts`.
- **Gráficos:** Utilizar `Recharts` ou equivalente já presente para o Radar.
- **Animações:** Framer Motion ou transições CSS (150-250ms).
- **Responsividade:** Layout adaptável de 2 colunas para 1 coluna no Mobile.

---
**IMPORTANTE:** Nenhuma alteração será feita em Tabelas, RPCs, RLS ou na seção de Gestão da Turma.
