# Plano de Correções - Fluxo Mobile e Ajustes Funcionais

Este plano visa corrigir bugs críticos de sincronização de dados (Minhas Inscrições, Autoavaliação), regras de negócio (Foto Obrigatória) e refinamentos de UX Mobile (Header, Modais, Pluralização).

## Problemas Técnicos Identificados

1. **Minhas Inscrições**: Inconsistência entre a Home (que usa `get_current_event_full`) e o modal "Minhas Inscrições" (que usa `get_my_history`). O modal informa "NENHUMA INSCRIÇÃO" mesmo com inscrição ativa.
2. **Autoavaliação**: Falha ao salvar devido a permissões de RLS ou falha na RPC `player_upsert_self_rating` após o último hardening.
3. **UX Mobile**:
    - `MobileNavBar` visível atrás de modais.
    - Foto em tela cheia sem visualização imersiva.
    - Pluralização incorreta ("1 RESERVAS").
    - Posição "NÃO DEFINIDA" poluindo a lista.
    - Cadeados em turmas onde o acesso já foi aprovado.
    - Header Mobile muito comprimido.

## Ações Propostas

### 1. Backend e Dados
- **Inscrições**: Unificar a lógica de "Inscrição Ativa". O modal "Minhas Inscrições" deve ser alimentado por uma query que utilize os mesmos critérios de evento ativo da Home.
- **Autoavaliação**: 
    - Auditar e corrigir permissões de RLS para a tabela `player_self_ratings`.
    - Garantir que `player_upsert_self_rating` funcione via Server Function (já implementada) mas valide corretamente o `context.userId`.
    - Registrar logs detalhados de erro no servidor para diagnóstico.

### 2. Frontend e UX
- **Modais**: Implementar estado global ou prop para ocultar a `MobileNavBar` quando modais específicos estiverem abertos. Adicionar `overflow-hidden` no `body`.
- **Foto Imersiva**: Refatorar `PlayerPhotoModal` para ocupar 100% da viewport, fundo preto e cabeçalho fixo.
- **Identidade Visual**: 
    - Ajustar `PlayerRow` na lista para não renderizar a linha de posição se `primary_position` for inválido.
    - Simplificar o Header Mobile conforme solicitado.
    - Corrigir pluralização dinâmica em contadores.
- **Cadeados**: Ajustar a lógica de renderização dos ícones de turma para refletir apenas `status !== 'approved'`.

### 3. Regras de Negócio
- **Foto**: Remover a opção "Remover Foto" no `PlayerAvatarEditable` para jogadores comuns, mantendo apenas para troca.

## Detalhes Técnicos

- **Arquivos Principais**: `src/routes/index.tsx`, `src/components/MyHistoryDialog.tsx`, `src/lib/players.functions.ts`, `src/components/MobileNavBar.tsx`.
- **Segurança**: Manter o uso de `supabaseAdmin` dentro das Server Functions para operações que exigem bypass de RLS restritivo, garantindo que o `userId` venha do cookie de sessão verificado.

## Verificação e Testes
- Testar inscrição em todas as turmas e visualizar no Perfil.
- Salvar autoavaliação e reabrir para confirmar persistência.
- Validar visualização mobile em simulador (viewport 380x1218).
- Confirmar que `npm run build` e typecheck passam sem erros.
