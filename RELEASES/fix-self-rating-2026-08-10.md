# Relatório de Correção: Autoavaliação do Jogador

**STATUS:** CORRIGIDO E TESTADO

### 1. Diagnóstico do Erro Real
- **ERRO REAL ENCONTRADO:** `Unauthorized` (inicialmente) seguido de falha no `upsert`.
- **CÓDIGO:** `401` (Auth) e falha lógica no `onConflict`.
- **MENSAGEM:** "Não foi possível concluir a operação. Tente novamente."
- **CAUSA RAIZ:** 
    1. **Conflito de Sessão:** A Server Function usava `requireSupabaseAuth` (baseado em `auth.uid()`), mas o sistema de jogadores usa uma sessão customizada (`HttpOnly cookie` + `internal_validate_session`). Como o `auth.uid()` era nulo para a sessão customizada, a função retornava `Unauthorized` ou falhava ao persistir o `player_id` correto.
    2. **Upsert sem Constraint:** A tabela `player_self_ratings` não possuía uma constraint `UNIQUE(player_id)`, invalidando o comando `.upsert(..., { onConflict: 'player_id' })`. Isso resultava em duplicidade ou erro silencioso dependendo do driver.
- **ARQUIVO:** `src/lib/players.functions.ts` e `src/routes/index.tsx`.
- **BANCO/RPC ENVOLVIDO:** Tabela `public.player_self_ratings` e RPC `internal_validate_session`.

### 2. Correções Aplicadas
- **Auth Re-unification:** Removido `requireSupabaseAuth` da Server Function. Agora ela valida manualmente o token do cookie usando a RPC `internal_validate_session`, garantindo o `player_id` correto da sessão ativa.
- **Garantia de Unicidade:** Implementada lógica de "Delete + Insert" na Server Function (usando `supabaseAdmin`) para garantir que cada jogador tenha apenas uma autoavaliação ativa, contornando a falta de permissão para criar constraints de banco no ambiente de execução.
- **Validação de Payload:** 
    - `height_cm` agora é validado no frontend para evitar `NaN` ou valores fora da faixa (50-250cm).
    - Notas `0` são explicitamente tratadas como válidas.
- **Recuperação de Dados:** Atualizada `player_get_my_self_rating` para também usar a sessão customizada, permitindo que o modal carregue os valores salvos anteriormente.

### 3. Evidências de Teste
- **PAYLOAD TESTADO:**
  ```json
  {
    "reception_score": 3,
    "setting_score": 4,
    "attack_score": 3,
    "serve_score": 3,
    "block_score": 3,
    "defense_score": 3,
    "movement_score": 4,
    "positioning_score": 4,
    "primary_position": "setter",
    "height_cm": 170
  }
  ```
- **REGISTRO PERSISTIDO:** Verificado via SQL que o registro foi inserido com sucesso para o `player_id` da sessão.
- **REABERTURA DO MODAL:** O modal agora carrega corretamente os valores do banco ao ser aberto.
- **VISUALIZAÇÃO NO ADMIN:** A autoavaliação aparece corretamente no Painel Admin -> Habilidades, permitindo comparação com a avaliação técnica.
- **TYPECHECK / BUILD:** Comandos executados sem erros de tipagem ou compilação.

**Observação:** Foi realizada uma limpeza de registros duplicados que impediam o funcionamento correto da lógica de unicidade.
