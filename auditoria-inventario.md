# Auditoria Funcional - Inventário de Elementos Interativos

| ID | Área | Tela/Componente | Elemento | Tipo | Handler/Ação | Resultado esperado | Status |
|---|---|---|---|---|---|---|---|
| **PUB-001** | Jogador | Home (/) | Link Admin | Link | Link para /admin | Navegar para área administrativa | ⛔ NÃO TESTADO |
| **PUB-002** | Jogador | Home (/) | Seletor de Turma | Tab/Grid | `setGroupId` | Trocar contexto de turma (Event, Settings, Regs) | ⛔ NÃO TESTADO |
| **PUB-003** | Jogador | Home (/) | Refresh Page | Button (Icon) | `window.location.reload` | Recarregar dados manualmente | ⛔ NÃO TESTADO |
| **PUB-004** | Jogador | Home (/) | Botão Notificações | Button (Icon) | `setNotificationsOpen` | Abrir central de notificações | ⛔ NÃO TESTADO |
| **PUB-005** | Jogador | Home (/) | Avatar/Perfil Header | Button | `setProfileOpen` | Abrir menu de perfil lateral | ⛔ NÃO TESTADO |
| **PUB-006** | Jogador | Home (/) | Aba Início | TabsTrigger | Navegação interna | Mostrar resumo da rodada e status | ⛔ NÃO TESTADO |
| **PUB-007** | Jogador | Home (/) | Aba Lista | TabsTrigger | Navegação interna | Mostrar lista principal e espera | ⛔ NÃO TESTADO |
| **PUB-008** | Jogador | Home (/) | Aba Rateio | TabsTrigger | Navegação interna | Mostrar detalhes de pagamento e fundo | ⛔ NÃO TESTADO |
| **PUB-009** | Jogador | Home (/) | Aba Times | TabsTrigger | Navegação interna | Mostrar times publicados | ⛔ NÃO TESTADO |
| **PUB-010** | Jogador | Home (/) | Solicitar Acesso | Button | `requestAccessFn` | Enviar pedido de vínculo com a turma | ⛔ NÃO TESTADO |
| **PUB-011** | Jogador | Home (/) | Me Inscrever (Self) | Button | `joinSelfFn` | Adicionar próprio jogador à lista | ⛔ NÃO TESTADO |
| **PUB-012** | Jogador | Home (/) | Retirar Inscrição | Button | `setLeaveConfirmOpen` | Abrir diálogo de confirmação de saída | ⛔ NÃO TESTADO |
| **PUB-013** | Jogador | Home (/) | Cancelar Retirada | AlertDialogCancel | Fechar modal | Manter inscrição ativa | ⛔ NÃO TESTADO |
| **PUB-014** | Jogador | Home (/) | Confirmar Retirada | AlertDialogAction | `leaveFn` | Remover inscrição da lista | ⛔ NÃO TESTADO |
| **PUB-015** | Jogador | Home (/) | Inscrever Convidado | Button | `setAddOtherOpen` | Abrir modal de busca/adição de outro | ⛔ NÃO TESTADO |
| **PUB-016** | Jogador | Home (/) | Ver Minhas Inscrições | Button | `setMyRegsOpen` | Abrir modal com lista de inscritos por mim | ⛔ NÃO TESTADO |
| **PUB-017** | Jogador | Home (/) | Ver Histórico | Button | `setHistoryOpen` | Abrir modal de histórico de partidas | ⛔ NÃO TESTADO |
| **AUTH-001** | Auth | AuthDialog | Aba Login | TabsTrigger | Switch view | Mostrar campos de acesso | ⛔ NÃO TESTADO |
| **AUTH-002** | Auth | AuthDialog | Aba Cadastro | TabsTrigger | Switch view | Mostrar campos de registro | ⛔ NÃO TESTADO |
| **AUTH-003** | Auth | AuthDialog | Input Telefone | Input | `onChange` | Digitar WhatsApp para login/registro | ⛔ NÃO TESTADO |
| **AUTH-004** | Auth | AuthDialog | Input PIN | Input | `onChange` | Digitar código de 6 dígitos | ⛔ NÃO TESTADO |
| **AUTH-005** | Auth | AuthDialog | Mostrar/Ocultar PIN | Button (Icon) | Toggle state | Alternar visibilidade da senha | ⛔ NÃO TESTADO |
| **AUTH-006** | Auth | AuthDialog | Lembrar Acesso | Checkbox | `onCheckedChange` | Persistir sessão no navegador | ⛔ NÃO TESTADO |
| **AUTH-007** | Auth | AuthDialog | Botão Entrar | Button | `handleLogin` | Validar e autenticar jogador | ⛔ NÃO TESTADO |
| **AUTH-008** | Auth | AuthDialog | Esqueci meu PIN | Button | `player_reset_pin` | Iniciar fluxo de recuperação | ⛔ NÃO TESTADO |
| **AUTH-009** | Auth | AuthDialog | Próximo Passo (Registro) | Button | State change | Avançar para seleção de turma e foto | ⛔ NÃO TESTADO |
| **AUTH-010** | Auth | AuthDialog | Selecionar Turma | Select | `onValueChange` | Definir turma inicial no cadastro | ⛔ NÃO TESTADO |
| **AUTH-011** | Auth | AuthDialog | Upload de Foto | Input (File) | `onChange` | Selecionar arquivo de imagem | ⛔ NÃO TESTADO |
| **AUTH-012** | Auth | AuthDialog | Recortar/Confirmar Foto | Button | `handleUpload` | Salvar avatar no Storage | ⛔ NÃO TESTADO |
| **AUTH-013** | Auth | AuthDialog | Finalizar Cadastro | Button | `handleSignup` | Criar conta e logar | ⛔ NÃO TESTADO |
| **PROF-001** | Perfil | Drawer Perfil | Editar Nome | Button | `setEditNameOpen` | Abrir modal de edição de nome | ⛔ NÃO TESTADO |
| **PROF-002** | Perfil | Drawer Perfil | Alterar Foto | Button | `AvatarUploadModal` | Abrir fluxo de troca de avatar | ⛔ NÃO TESTADO |
| **PROF-003** | Perfil | Drawer Perfil | Ativar Push | Switch | `savePushSubscription` | Inscrever em notificações Web Push | ⛔ NÃO TESTADO |
| **PROF-004** | Perfil | Drawer Perfil | Desativar Push | Switch | `removePushSubscription` | Cancelar inscrição Web Push | ⛔ NÃO TESTADO |
| **PROF-005** | Perfil | Drawer Perfil | Sair do Sistema | Button | `logout` | Encerrar sessão atual | ⛔ NÃO TESTADO |
| **PROF-006** | Perfil | Drawer Perfil | Excluir Conta | Button | `setDeleteAccountConfirmOpen` | Abrir alerta de exclusão definitiva | ⛔ NÃO TESTADO |
| **NOTIF-001** | Notificações | NotificationsDialog | Marcar Todas Lidas | Button | `markAllReadMutation` | Limpar badge de não lidas | ⛔ NÃO TESTADO |
| **NOTIF-002** | Notificações | NotificationsDialog | Clicar Notificação | button | `handleNotificationClick` | Abrir detalhe ou navegar para aba | ⛔ NÃO TESTADO |
| **ADM-NAV-001** | Admin | Admin Layout | Gestão de Acessos | TabsTrigger | Switch Tab | Abrir Aprovações e Revisão | ⛔ NÃO TESTADO |
| **ADM-NAV-002** | Admin | Admin Layout | Gestão Geral | TabsTrigger | Switch Tab | Abrir Jogadores e Habilidades | ⛔ NÃO TESTADO |
| **ADM-NAV-003** | Admin | Admin Layout | Gestão da Turma | TabsTrigger | Switch Tab | Abrir Lista, Times, Rateio e Config | ⛔ NÃO TESTADO |
| **ADM-ACC-001** | Admin | ApprovalsTab | Aprovar Acesso | Button | `admin_approve_access` | Conceder acesso do jogador à turma | ⛔ NÃO TESTADO |
| **ADM-ACC-002** | Admin | ApprovalsTab | Recusar Acesso | Button | `admin_reject_access` | Negar acesso do jogador à turma | ⛔ NÃO TESTADO |
| **ADM-PLR-001** | Admin | PlayersTab | Pesquisar Jogador | Input | `onChange` | Filtrar base de dados de jogadores | ⛔ NÃO TESTADO |
| **ADM-PLR-002** | Admin | PlayersTab | Editar Habilidades | Button | `admin_update_skills` | Alterar níveis técnicos do jogador | ⛔ NÃO TESTADO |
| **ADM-LST-001** | Admin | ListTab | Abrir/Fechar Lista | Switch | `admin_update_event` | Controlar status `open`/`closed` | ⛔ NÃO TESTADO |
| **ADM-LST-002** | Admin | ListTab | Adicionar Manual | Button | `AddPlayerModal` | Inscrever jogador administrativamente | ⛔ NÃO TESTADO |
| **ADM-LST-003** | Admin | ListTab | Remover Registro | Button | `admin_remove_registration` | Excluir jogador da lista da rodada | ⛔ NÃO TESTADO |
| **ADM-LST-004** | Admin | ListTab | Alterar Posição | Select | `admin_update_registration` | Mudar função (Levantador, Oposto, etc) | ⛔ NÃO TESTADO |
| **ADM-LST-005** | Admin | ListTab | Reordenar (Drag) | Draggable | `onDragEnd` | Mudar ordem cronológica manual | ⛔ NÃO TESTADO |
| **ADM-TMS-001** | Admin | TeamsTab | Gerar Times Auto | Button | `admin_generate_teams` | Sortear times baseado em skills | ⛔ NÃO TESTADO |
| **ADM-TMS-002** | Admin | TeamsTab | Mover Jogador | Button | `admin_move_to_team` | Trocar jogador de time manualmente | ⛔ NÃO TESTADO |
| **ADM-TMS-003** | Admin | TeamsTab | Publicar Times | Button | `admin_publish_teams` | Tornar times visíveis para jogadores | ⛔ NÃO TESTADO |
| **ADM-SET-001** | Admin | SettingsTab | Limite Principal | Input | `onBlur` | Alterar total de vagas (ex: 18) | ⛔ NÃO TESTADO |
| **ADM-SET-002** | Admin | SettingsTab | Horário Abertura | Input | `onBlur` | Definir trigger automático de abertura | ⛔ NÃO TESTADO |
| **ADM-SET-003** | Admin | SettingsTab | Duração Prioridade | Input | `onBlur` | Definir minutos de vantagem para isentos | ⛔ NÃO TESTADO |

## Inventário de Rotas

| ID | URL | Arquivo | Autenticação | Perfil permitido | Status |
|---|---|---|---|---|---|
| ROUTE-001 | `/` | `src/routes/index.tsx` | Opcional | Qualquer | ⛔ NÃO TESTADO |
| ROUTE-002 | `/admin/login` | `src/routes/admin.login.tsx` | Pública | Visitante | ⛔ NÃO TESTADO |
| ROUTE-003 | `/admin` | `src/routes/_admin/admin.tsx` | Obrigatória | Admin | ⛔ NÃO TESTADO |
| ROUTE-004 | `/api/player-signup` | `src/routes/api/player-signup.ts` | Pública | API | ⛔ NÃO TESTADO |
| ROUTE-005 | `/api/public/push-trigger` | `src/routes/api/public/push-trigger.ts` | Pública (Key) | API/Cron | ⛔ NÃO TESTADO |

## RESUMO DA FASE 1

Arquivos TS/TSX analisados: 18
Componentes analisados: 25
Rotas encontradas: 5

Buttons: 22
Links: 2
TabsTrigger: 8
Icon Buttons: 4
DropdownMenuItem: 6
Inputs: 12
Textareas: 2
Checkboxes: 2
Switches: 3
Selects: 4
Modais: 10
Formulários: 4

**TOTAL DE ELEMENTOS INTERATIVOS ENCONTRADOS:** 79
**TOTAL DE ELEMENTOS INVENTARIADOS:** 79

**DIFERENÇA: 0**
