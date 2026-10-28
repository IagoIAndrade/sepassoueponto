# Plano de Correção e Padronização das Notificações

Este plano visa estabilizar o sistema de notificações (Push e In-App), garantindo deep links corretos com contexto de turma, deduplicação em primeiro plano e atualização da identidade visual.

## Reconciliação da Auditoria

*   **Push Ativos Reais:** 5 (`promoted_to_main`, `registration_opened`, `event_cancelled`, `access_approved`, `organization_announcement`).
*   **Push Parciais:** 1 (`teams_published`, falta gatilho).
*   **In-App Ativos:** 8 (os acima + `registration_confirmed`, `waitlist_joined`).
*   **Somente Definidos:** 3 (`event_changed`, `withdrawal_deadline`, `payment_pending`).

## Mudanças Técnicas

### 1. Identidade Visual (v3)
*   Atualizar `public/sw-push.js` para usar `/pwa-icon-192-v3.png` nos campos `icon` e `badge`.

### 2. Deep Links com Contexto de Turma
*   **Web Push (Server):** Ajustar `src/lib/push.functions.ts` para garantir que `groupId` e `eventId` sejam enviados no payload.
*   **Service Worker:** Refatorar a lógica de construção de URL para garantir que o `group` e `view` sejam prioritários.
*   **Deduplicação:** Implementar no Service Worker um check via `clients.matchAll` para enviar uma mensagem ao frontend via `postMessage` se o app estiver aberto, permitindo que o frontend decida se exibe ou não a notificação do sistema (ou simplesmente não disparar o push se o app estiver focado).

### 3. Gatilho para "Times Publicados"
*   Modificar `admin_save_teams` em `src/lib/admin.functions.ts` para disparar `internalCreateNotification` com o tipo `teams_published`.
*   Implementar lógica para evitar disparos repetidos se os times não mudarem significativamente (ou se for apenas rascunho, embora o sistema atual já considere o save como publicação).

### 4. Conteúdo das Notificações
*   Refinar `bodyMap` em `src/lib/push.functions.ts` para incluir nomes de turmas e datas dinamicamente (passados via metadata se necessário, ou buscados no processamento).

### 5. Deduplicação de Notificações (Foreground)
*   No frontend (`src/routes/__root.tsx` ou componente global), ouvir mensagens do Service Worker.
*   Se o app estiver aberto e focado, o Service Worker deve evitar `showNotification` se o frontend confirmar que já exibiu o Toast.

## User-facing changes

*   **Notificações mais inteligentes:** Ao clicar em um aviso, você será levado diretamente para a turma e aba correta (Início, Lista ou Times).
*   **Texto personalizado:** As mensagens agora informam claramente qual turma (Ex: Terça-feira) abriu inscrições ou confirmou sua vaga.
*   **Menos ruído:** Se você estiver com o app aberto, não receberá a notificação duplicada do sistema operacional.
*   **Visual atualizado:** O ícone das notificações agora segue a identidade visual mais recente do aplicativo.

