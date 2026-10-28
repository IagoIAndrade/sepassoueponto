# Auditoria de Performance — SE PASSOU, É PONTO

**Data:** 11/08/2026
**Foco:** Mobile UX e redução de gargalos de rede/renderização.

## 1. Inventário de Gargalos Identificados

### G1: Inundação de Requests no Boot (Home)
- **PROBLEMA:** A Home mobile dispara mais de 200 requisições no carregamento inicial (simulado localmente). Muitas são pre-fetches de ícones ou componentes não visíveis.
- **IMPACTO:** Alto latência em conexões 3G/4G. Disputa de banda com a RPC crítica `get_current_event_full`.
- **STATUS:** Pendente de otimização via code splitting e suspensão de pre-fetch agressivo.

### G2: N+1 de Avatares (O Cascading de Imagens)
- **PROBLEMA:** O componente `PlayerAvatar` utiliza um hook `useQuery` individual para obter a Signed URL de cada imagem. Em uma lista com 40+ jogadores, isso gera 40 chamadas `get_avatar_signed_url` em paralelo.
- **IMPACTO:** Sobrecarga do servidor de funções (limitado a concorrência) e lentidão na renderização da lista.
- **STATUS:** **CRÍTICO.** Necessário otimizar para obter URLs em lote (batching) ou usar cache mais agressivo no edge.

### G3: Re-renderização Global na Home
- **PROBLEMA:** O estado da Home (`index.tsx`) é centralizado em um componente gigante de 3600+ linhas. Mudanças simples (como o countdown de 1s ou a troca de turma) provocam reconciliação de toda a árvore de componentes (Abas, Modais, Footer).
- **IMPACTO:** Mobile "janky" durante o scroll e troca de abas.
- **STATUS:** Médio. O countdown deve ser movido para um componente folha isolado.

### G4: Bundle Administrativo Pesado
- **PROBLEMA:** Componentes administrativos (DND, Gráficos de Habilidades) estão sendo carregados no bundle principal ou importados diretamente sem `lazy()`.
- **IMPACTO:** Aumento do TBT (Total Blocking Time) na Home.
- **STATUS:** Médio. Mover tabs do admin para lazy loading.

---

## 2. Plano de Ação (Sprint Performance)

### Ação 1: Otimização de Avatares (Batching)
- **ALTERAÇÃO:** Refatorar `get_current_event_full` para já retornar as Signed URLs dos avatares das inscrições atuais.
- **BENEFÍCIO:** Redução de N requests para 0 na carga da lista.
- **TRADE-OFF:** Payload inicial da RPC ligeiramente maior (apenas strings de URL).

### Ação 2: Isolamento do Countdown
- **ALTERAÇÃO:** Criar `src/components/RegistrationCountdown.tsx` para gerenciar o `setInterval` localmente.
- **BENEFÍCIO:** Evita re-render da Home a cada 1 segundo.
- **COMO MEDIR:** React Profiler -> Highlight updates.

### Ação 3: Code Splitting Administrativo
- **ALTERAÇÃO:** Usar `React.lazy` para as abas pesadas em `admin.tsx` (SkillsTab, TeamsTab).
- **BENEFÍCIO:** Redução do bundle inicial do jogador em ~150KB (estimado).

### Ação 4: Supressão de Consultas Duplicadas
- **ALTERAÇÃO:** Unificar `my-regs` e `event-full` se possível, ou garantir que `staleTime` impeça refetch imediato após login.
- **BENEFÍCIO:** Economia de chamadas Supabase.

---

## 3. Próximos Passos
1. Implementar `RegistrationCountdown`.
2. Otimizar `PlayerAvatar` com batching ou cache compartilhado.
3. Mover imports pesados para lazy loading.
