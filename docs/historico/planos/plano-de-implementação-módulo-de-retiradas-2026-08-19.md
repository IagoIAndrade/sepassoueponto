# Plano de Implementação: Módulo de Retiradas

Implementar um sistema robusto de histórico de retiradas (withdrawals) para rodadas de vôlei, garantindo rastreabilidade total de saídas (jogadores e administradores) sem afetar a lógica crítica de reordenação e promoção.

## Etapa 1: Infraestrutura de Banco de Dados
- **Criar tabela `registration_withdrawals`**:
    - `id`, `event_id`, `group_id`, `registration_id`, `player_id`.
    - `player_name_snapshot`: Nome no momento da saída.
    - `removed_at`: Data/hora da ação.
    - `removed_by_id`: UUID do autor (auth.uid()).
    - `removal_source`: 'player' ou 'admin'.
    - `deadline_status`: 'in_time' ou 'late'.
    - `list_type_snapshot`: 'main' ou 'wait'.
    - `metadata`: JSONB para contexto extra (ex: logs de promoção).
- **Habilitar RLS e Grants**: Acesso restrito a administradores.

## Etapa 2: Automação de Registro (Trigger)
- **Função `fn_log_registration_withdrawal`**:
    - Disparada após `UPDATE` na tabela `registrations`.
    - Filtro: `OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL`.
    - Lógica: Captura `auth.uid()`, verifica o status do deadline (cruzando com `app_settings`) e insere na nova tabela.
- **Trigger `tr_log_withdrawal`**: Associar a função à tabela `registrations`.

## Etapa 3: Interface Administrativa (Frontend)
- **Novo componente `WithdrawalsTab.tsx`**:
    - Lista cronológica inversa das retiradas.
    - Cards informativos com: Nome, Data/Hora, Autor, Status (No Prazo / Atrasado), Lista (Titular/Reserva).
    - Filtros por Evento/Turma.
- **Registro da Aba**: Adicionar "RETIRADAS" à navegação lateral do `admin.tsx`.

## Etapa 4: Auditoria Histórica (Manual)
- Executar script SQL para povoar a nova tabela com retiradas das rodadas ativas (`Terça 18/08`, `Quarta 19/08`, `Quinta 20/08`) baseando-se nos dados atuais de `registrations` e `admin_actions_log`.

## Detalhes Técnicos
- **Segurança**: Uso de `SECURITY DEFINER` na trigger para garantir que o log seja escrito mesmo se o usuário tiver permissões restritas em tabelas de auditoria.
- **Deadline**: A lógica de `deadline_status` respeitará o fuso `America/Sao_Paulo` conforme configurado em `app_settings`.
- **Integridade**: A alteração é 100% aditiva; não modifica as RPCs `admin_remove_registration_v3` ou `internal_leave_registration_v3`.
