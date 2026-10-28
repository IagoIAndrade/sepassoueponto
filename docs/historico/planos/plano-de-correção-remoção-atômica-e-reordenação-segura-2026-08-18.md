# Plano de Correção: Remoção Atômica e Reordenação Segura

O objetivo deste plano é resolver definitivamente o erro `duplicate key value violates unique constraint "uq_reg_position_active"` que ocorre ao cancelar inscrições (pelo admin ou pelo próprio jogador). O erro é causado pela colisão temporária de posições durante o `UPDATE` de reordenação.

## Alterações Técnicas

### 1. Refatoração das Funções de Banco de Dados (RPC)
As funções `admin_remove_registration_v3` e `internal_leave_registration_v3` serão atualizadas para implementar uma estratégia de reordenação em duas fases:
- **Fase 1**: Mover todos os registros afetados para uma faixa de posições temporárias negativas (ex: `-1 * position_number`). Isso libera as posições originais no índice único (que tem `WHERE cancelled_at IS NULL`).
- **Fase 2**: Mover os registros das posições negativas para as novas posições definitivas (posicao - 1).
- **Atomicidade**: Garantir o uso de `pg_advisory_xact_lock` em todas as operações de escrita na tabela `registrations` para evitar race conditions.

### 2. Sincronização de Promoção
- A lógica de promoção (movers da reserva para a principal) será unificada para usar a mesma estratégia de duas fases, garantindo que o buraco deixado pela remoção seja preenchido sem colisões.

### 3. Melhoria na Auditoria de Erros
- Ajustar os logs de `admin_actions_log` para garantir que falhas silenciosas não mascarem problemas de permissão.

## Detalhes de Implementação

- Criar uma nova migração SQL que redefine as funções `admin_remove_registration_v3` e `internal_leave_registration_v3`.
- Testar a nova lógica com um script de teste E2E que simula 20+ jogadores e remoções simultâneas em posições de início e meio da lista.

---
**Observação**: Esta mudança é puramente no backend (SQL) e não altera a interface visual, mas resolve o travamento reportado no Painel Administrativo.
