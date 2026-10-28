# Auditoria de Segurança - SE PASSOU, É PONTO

Relatório gerado em: 11/08/2026

## Sumário Executivo
O sistema apresenta uma arquitetura baseada em Supabase com Row-Level Security (RLS) e Funções Definidas pelo Servidor (RPCs). A auditoria identificou vulnerabilidades críticas relacionadas a **Broken Access Control** e **Excesso de Privilégios** em funções administrativas, além de falhas na configuração do search_path em funções `SECURITY DEFINER`.

---

## 1. Vulnerabilidades Identificadas

### [CRÍTICA] Quebra de Controle de Acesso em Funções Administrativas
- **SEVERIDADE:** Crítica
- **Vetor de Ataque:** Chamada direta de RPC via cliente Supabase (PostgREST).
- **Cenário de Exploração:** O atacante, autenticado como um jogador comum, chama `admin_create_next_event_v2` ou `admin_save_reviewed_accesses_v2`. Devido ao `GRANT EXECUTE TO PUBLIC` e falta de validação interna robusta em algumas funções, o atacante pode criar rodadas ou aprovar seu próprio acesso a turmas restritas.
- **Funções Afetadas:** 
  - `admin_create_next_event_v2` (Falta validação de admin no início)
  - `admin_save_reviewed_accesses_v2` (Concedido a PUBLIC, validação apenas via parâmetro)
  - `admin_auto_enroll_organizers` (Concedido a PUBLIC)
- **Correção:** 
  1. Revogar `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC/authenticated`.
  2. Conceder `GRANT EXECUTE` apenas às funções necessárias para jogadores.
  3. Adicionar `IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'unauthorized'; END IF;` no início de cada função administrativa.
- **Impacto:** Comprometimento total da integridade das rodadas e controle de acesso aos grupos.

### [ALTA] Falha de Injeção de Search Path (Path Hijacking)
- **SEVERIDADE:** Alta
- **Vetor de Ataque:** Criação de objetos maliciosos em esquemas temporários ou públicos.
- **Cenário de Exploração:** Funções `SECURITY DEFINER` que não definem explicitamente o `search_path` (como `player_request_group_access`) podem ser induzidas a executar funções ou operadores maliciosos criados por um usuário com permissão de criar objetos em `public` ou `pg_temp`.
- **Funções Afetadas:** `player_request_group_access`, `fn_notify_promotion`, entre outras.
- **Correção:** Definir sempre `SET search_path = public, pg_catalog, pg_temp` em todas as funções `SECURITY DEFINER`.
- **Impacto:** Escalação de privilégios para a role da função (geralmente `postgres`/`service_role`).

### [MÉDIA] Exposição de Dados Sensíveis por Falta de RLS
- **SEVERIDADE:** Média
- **Vetor de Ataque:** Consulta direta via PostgREST.
- **Cenário de Exploração:** Tabelas como `volleyball_events` e `player_groups` não possuem políticas RLS ativas, mas possuem GRANTS para `authenticated`. Isso permite que qualquer jogador autenticado liste todos os eventos e todos os pedidos de acesso, incluindo motivos de rejeição ou observações privadas.
- **Tabelas Afetadas:** `volleyball_events`, `player_groups`, `admin_actions_log`.
- **Correção:** Habilitar RLS e criar políticas `SELECT` restritas.
- **Impacto:** Vazamento de informações de governança e privacidade dos jogadores.

### [MÉDIA] Permissividade Excessiva no Storage (Avatars)
- **SEVERIDADE:** Média
- **Vetor de Ataque:** Enumeração de URLs de storage.
- **Cenário de Exploração:** A política `Users can view avatars of their peers` contém um `OR true` no final da expressão `qual`, o que anula todas as restrições anteriores e torna todos os avatares públicos para qualquer usuário autenticado ou anônimo, ignorando o isolamento por turma.
- **Bucket Afetado:** `player-avatars`
- **Correção:** Remover o `OR true` e ajustar a lógica para validar a função `internal_check_avatar_access`.
- **Impacto:** Violação de privacidade e descumprimento do requisito de isolamento entre turmas.

---

## 2. Matriz de Validação Obrigatória

| Requisito | Status | Observação |
| :--- | :--- | :--- |
| Virar admin via request | **VULNERÁVEL** | `user_roles` tem RLS, mas RPCs administrativas estão expostas. |
| Alterar outro jogador | **PROTEGIDO** | RLS na `players` (qual: `id = auth.uid()`) protege updates. |
| Alterar avaliação administrativa | **PROTEGIDO** | `player_skills` possui política restrita a admins. |
| Alterar configurações | **PARCIAL** | RPCs de configuração estão expostas a `authenticated`. |
| Acessar dados administrativos | **VULNERÁVEL** | Tabelas de log e eventos sem RLS. |
| Modificar outra inscrição | **PROTEGIDO** | RLS na `registrations` valida `auth.uid() = player_id`. |
| Acesso a arquivos privados | **VULNERÁVEL** | Política de storage com `OR true`. |

---

## 3. Plano de Mitigação Imediata

1. **Saneamento de Grants:**
   ```sql
   REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
   REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
   -- Conceder apenas as públicas necessárias
   GRANT EXECUTE ON FUNCTION public.internal_join_event TO authenticated;
   GRANT EXECUTE ON FUNCTION public.internal_leave_registration_v2 TO authenticated;
   -- ... outras funções de uso do jogador
   ```

2. **Reforço de RPCs Administrativas:**
   Aplicar o decorator de segurança em todas as funções `admin_*`:
   ```sql
   IF NOT public.has_role(auth.uid(), 'admin') THEN 
     RAISE EXCEPTION 'unauthorized'; 
   END IF;
   ```

3. **Correção do Storage:**
   Remover o bypass da política de avatares.

4. **Ativação de RLS:**
   Garantir que todas as tabelas no schema `public` tenham RLS habilitado e políticas `SELECT` coerentes.

---

## 4. Teste de Comprovação (PoC)

Para validar a correção da vulnerabilidade crítica de RPC:
1. Logar com usuário não-admin.
2. Executar no console do navegador:
   ```javascript
   const { data, error } = await supabase.rpc('admin_create_next_event_v2', { p_group_id: '...' });
   console.log(error);
   ```
3. **Resultado Esperado Após Correção:** Erro 403 (Forbidden) ou mensagem "unauthorized" via Exception.

---
**Auditor:** Lovable AI Agent
**Status da Auditoria:** Concluída com descobertas críticas.
