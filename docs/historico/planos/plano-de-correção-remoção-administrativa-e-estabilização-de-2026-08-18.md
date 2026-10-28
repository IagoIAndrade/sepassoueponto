# Plano de Correção: Remoção Administrativa e Estabilização de Promoção

O objetivo deste plano é corrigir a falha na remoção de jogadores pelo painel administrativo e garantir que a promoção automática de reservas funcione de forma robusta e atômica, unificando a lógica com a do fluxo do jogador.

## Alterações Propostas

### 1. Backend (SQL)
- Atualizar a função `admin_remove_registration_v3` para:
  - Usar os nomes de colunas corretos (`position_number`, `list_type`).
  - Corrigir a conversão de tipo de `list_type` (de string/text para o enum real da tabela).
  - Unificar a lógica de promoção atômica, garantindo que o próximo reserva seja promovido e as posições subsequentes compactadas corretamente.
  - Resolver o bug de "posição + 100000" que era uma técnica legada para evitar conflitos de índice único durante reordenação, substituindo por uma reordenação atômica dentro de um lock de evento.

### 2. Frontend (Server Functions)
- Revisar `src/lib/admin.functions.ts`:
  - Garantir que a função `admin_remove` chame a RPC `admin_remove_registration_v3` com os parâmetros corretos.
  - Garantir que a função administrativa use `supabaseAdmin` para ter permissões totais sobre a tabela de inscrições (RLS bypass controlado).

### 3. Validação
- Testar a remoção de um jogador titular e verificar se:
  - O jogador foi cancelado.
  - O primeiro reserva subiu para titular.
  - A ordem da reserva foi compactada.
  - Os logs de auditoria administrativa foram gerados.

## Detalhes Técnicos
- A tabela `registrations` usa os campos `list_type` (enum) e `position_number` (int).
- O erro atual no Admin provavelmente se deve ao uso de `waitlist_order` ou erro de cast de `list_type`.
- A RPC será atualizada via migração para garantir persistência.

```sql
-- Exemplo da correção na RPC
CREATE OR REPLACE FUNCTION public.admin_remove_registration_v3(...)
...
UPDATE public.registrations 
SET list_type = 'main'::public.list_type, 
    position_number = v_next_pos 
WHERE id = v_wait_row.id;
...
```
