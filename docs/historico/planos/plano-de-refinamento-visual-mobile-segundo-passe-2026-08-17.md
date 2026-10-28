# Plano de Refinamento Visual Mobile (Segundo Passe)

Este plano foca exclusivamente na melhoria da hierarquia visual, redução de redundância e otimização do espaço vertical nas telas mobile, sem alterar nenhuma funcionalidade de backend ou lógica de negócio.

## Alterações Propostas

### 1. Refatoração de Componentes
- **EventContextCard.tsx**: Adicionar prop `variant="compact"` para exibição reduzida em abas secundárias.
- **PlayerEventStatus.tsx**: Ajustar estilos para melhor integração com o contexto compactado.

### 2. Otimização da Home (Aba Início)
- Remover cards redundantes de "Titulares" e "Reservas" que repetem o resumo.
- Reordenar seção: Status do Jogador -> Resumo da Rodada -> Ações (Sair/Adicionar) -> Perfil/Autoavaliação.
- Substituir label "OPEN" por "ABERTA".

### 3. Contexto Compacto em Abas Secundárias
- Nas abas **Lista**, **Rateio** e **Times**, o contexto da rodada ocupará menos espaço vertical.
- O conteúdo principal de cada aba aparecerá mais cedo na tela.

### 4. Ajustes de UI/UX Específicos
- **Lista**: Remover resumo duplicado antes da lista principal.
- **Rateio/Times**: Reduzir espaçamento superior para priorizar o conteúdo da aba.
- **Alertas**: Corrigir inconsistência entre "Alertas Ativos" e o botão de ação.
- **Header**: Encurtar subtítulo para evitar truncamento (ex: "QUARTA • LOCAL").
- **Notificações**: Ajustar altura do modal para ser proporcional ao conteúdo.

### 5. Legibilidade e Contraste
- Revisar cores de labels secundários e horários para garantir melhor leitura em dispositivos mobile.

## Detalhes Técnicos
- Uso de props condicionais em componentes existentes.
- Reorganização de blocos JSX em `src/routes/index.tsx`.
- Ajustes de classes Tailwind para `padding`, `margin` e `font-size`.

## O que NÃO será alterado
- Nenhuma lógica de banco de dados, RPC, RLS ou Autenticação.
- Nenhuma funcionalidade de inscrições, times ou rateio.
- Nenhum comportamento de notificações push ou service worker.
