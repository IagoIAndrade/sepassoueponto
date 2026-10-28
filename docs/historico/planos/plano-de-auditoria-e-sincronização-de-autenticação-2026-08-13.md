# Plano de Auditoria e Sincronização de Autenticação

Este plano visa resolver a inconsistência onde a interface do usuário exibe dados do jogador enquanto a sessão do Supabase está inválida ou expirada, além de robustecer o fluxo de Notificações Push para lidar corretamente com a renovação de tokens.

## Alterações Propostas

### 1. Robustecimento do Fluxo de Push (`src/routes/index.tsx`)
- Implementar `handleTogglePush` com fluxo de renovação:
  1. Tentar `supabase.auth.getSession()`.
  2. Se falhar ou token expirar em breve, tentar `supabase.auth.refreshSession()`.
  3. Usar o novo token para as chamadas de `server function`.
  4. Somente solicitar login se o refresh falhar categoricamente.
- Adicionar logs de auditoria seguros (sem expor tokens) para depuração.

### 2. Sincronização Global de Estado (`src/routes/index.tsx`)
- Implementar um listener robusto `supabase.auth.onAuthStateChange`.
- Garantir que eventos `SIGNED_OUT` limpem o cache do TanStack Query (`me`, `my-regs`, etc.).
- Tratar `TOKEN_REFRESHED` para garantir que a interface utilize o estado mais recente.
- Impedir que a UI considere `player != null` como prova de sessão ativa se o Supabase reportar `null`.

### 3. Suporte a Múltiplos Dispositivos
- Garantir que as assinaturas de Push sejam tratadas por dispositivo (`endpoint` único no banco).
- Remover dependências de tokens armazenados em closures que possam estar obsoletos entre abas/dispositivos.

### 4. Validação e Testes
- **Teste A:** Login e ativação imediata (Sucesso nominal).
- **Teste B:** Refresh silencioso (Simular token expirado, validar renovação sem logout).
- **Teste C:** Logout forçado (Sessão realmente inválida -> UI limpa e pede login).
- **Teste D:** Multi-browser (Validar que sessões independentes não se atropelam).

## Detalhes Técnicos
- O arquivo principal afetado será `src/routes/index.tsx`.
- Utilizaremos as APIs nativas do Supabase Client para gestão de ciclo de vida da sessão.
- A auditoria de logs será feita via `console.log` com prefixo `[PUSH_AUDIT]`.
