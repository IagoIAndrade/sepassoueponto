# Plano de Redesign: Central da Rodada (Gestão da Turma)

Transformação visual e de UX da aba "Gestão da Turma" no Painel Administrativo do projeto **SE PASSOU, É PONTO**, elevando-a ao status de "Central da Rodada" com foco em hierarquia, densidade e identidade esportiva.

## 1. Navegação Principal e Layout (admin.tsx)
- Refatorar os `TabsTrigger` principais para um estilo mais "elevado" e sofisticado, removendo o retângulo amarelo sólido.
- Ajustar os rótulos: **ACESSOS**, **JOGADORES**, **TURMA**.
- Adicionar números de seção (01, 02, 03) com estilo discreto.

## 2. Barra de Operação da Rodada (admin.tsx)
- Transformar a navegação interna da turma em uma barra de ferramentas iconográfica e compacta.
- Ícones para: Lista, Organização, Ocorrências, Times, Rateio, Regras (ex-Configurações), Retiradas.
- Implementar badges de contagem (ex: Ocorrências, Retiradas) baseados nos dados já carregados.

## 3. Lista Principal (ListTab.tsx)
- **Cabeçalho:** Novo componente `RoundStatusHeader` com status ("LISTA ABERTA") e barra de ocupação CSS para titulares (18/18).
- **Ações:** Reorganizar botões com hierarquia clara (Primário: + Adicionar; Secundário: Copiar/Fechar).
- **Linhas de Jogadores:** Componente `RosterPlayerRow` compacto, com foto, posição numérica em destaque e badges de status padronizados (Organizador, Admin, Reserva).

## 4. Organizadores (OrganizersTab.tsx)
- Reduzir o peso visual (amarelo) das linhas de prioridade.
- Destaque tipográfico para o Top 3 (1º, 2º, 3º).
- Adicionar legendas explicativas para os status de acesso.

## 5. Central Disciplinar (IncidentsTab.tsx)
- Adicionar resumo de contagem superior (Pendentes/Resolvidos).
- Estilo de cards `IncidentCard` com cores semânticas discretas.

## 6. Times (TeamsTab.tsx)
- Agrupamento visual das ações (Montagem, Histórico, Saída, Finalização).
- Exibição discreta de siglas de posição (LEV, PON, etc.) quando disponíveis.
- Feedback visual para "Todos Distribuídos".

## 7. Rateio e Regras (FundParticipantsTab.tsx, SettingsTab.tsx)
- **Rateio:** Interface de tabela compacta para desktop e cards otimizados para mobile. Barra de progresso financeira.
- **Regras:** Layout em duas colunas (Desktop), transformando inputs técnicos em resumos legíveis ("Equivale a 2h03").

## 8. Retiradas (WithdrawalsTab.tsx)
- Harmonização visual com o novo padrão "Central da Rodada".

---

## Detalhes Técnicos
- **Preservação de Lógica:** Nenhuma alteração em RPCs, migrations ou handlers de dados.
- **Componentização:** Criação de pequenos componentes visuais utilitários dentro dos mesmos arquivos para manter a coesão.
- **CSS:** Uso de variáveis de tema e utilitários Tailwind v4 para micro-animações (150-250ms transitions).
- **Sticky UI:** Navegação interna e cabeçalhos de lista permanecerão sticky onde aplicável.
