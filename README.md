<div align="center">

<img src="public/se-passou-e-ponto.png" alt="Se Passou, É Ponto" width="160" />

# 🏐 Se Passou, É Ponto

**Gestão completa para grupos de vôlei amador — da lista de presença ao rateio da bola.**

Lista de presença com prioridade e reserva automática, sorteio de times equilibrado por habilidade,
controle financeiro, ocorrências e notificações push. Tudo num app leve, instalável no celular.

![TanStack Start](https://img.shields.io/badge/TanStack_Start-1.168-FF4154?style=for-the-badge&logo=reactquery&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-instalável-5A0FC8?style=for-the-badge&logo=pwa&logoColor=white)

</div>

---

## ✨ Por que existe

Todo grupo de vôlei tem os mesmos problemas: a lista no WhatsApp que vira bagunça, quem chegou primeiro,
quem desistiu em cima da hora, times desequilibrados e aquela vaquinha que ninguém lembra quem pagou.

O **Se Passou, É Ponto** resolve isso com um único link: o jogador entra, se inscreve e acompanha tudo;
o organizador controla a rodada inteira por um painel administrativo.

---

## 🎯 Funcionalidades

### 👟 Para o jogador

| | Recurso | Descrição |
|---|---|---|
| 🔐 | **Acesso por PIN** | Cadastro simples com WhatsApp/CPF e PIN — sem e-mail, sem senha complicada. Sessão segura em cookie HttpOnly. |
| 📋 | **Inscrição na rodada** | Entra na lista com um toque e pode levar **1 convidado**. |
| ⏱️ | **Janela de prioridade** | Jogadores prioritários entram assim que a lista abre; os demais após o tempo configurado. |
| 🔁 | **Reserva automática** | Saiu alguém da lista principal? O primeiro da reserva sobe sozinho, respeitando a ordem de chegada. |
| 👥 | **Times da rodada** | Veja em qual time você caiu assim que o sorteio é publicado. |
| 💰 | **Minha situação no rateio** | Acompanhe pagamentos e pendências do fundo de equipamentos. |
| ⭐ | **Autoavaliação** | Informe sua posição preferida (levantador, ponteiro, central, oposto, líbero) e nível. |
| 🔔 | **Notificações push** | Aviso de abertura de lista, promoção da reserva, times sorteados e lembretes. |
| 📱 | **Instalável (PWA)** | Adicione à tela inicial e use como um app nativo. |
| 🏟️ | **Multi-turma** | Participe de várias turmas independentes com o mesmo cadastro. |

### 🛡️ Para o organizador (painel `/admin`)

| | Aba | O que faz |
|---|---|---|
| ✅ | **Aprovações** | Aprova ou recusa novos jogadores e revisa acessos a cada turma. |
| 📋 | **Lista** | Controle da rodada atual: presença, reserva, convidados, saídas e ações em massa. |
| 🧑‍🤝‍🧑 | **Jogadores** | Cadastro, busca, bloqueio, desativação e reset de PIN. |
| 📊 | **Habilidades** | Avaliação técnica em 5 critérios com pesos configuráveis. |
| ⚠️ | **Ocorrências** | Registro de incidentes e penalidades (ex.: saída fora do prazo gera multa automática). |
| 🎲 | **Times** | Sorteio **equilibrado** (serpentina otimizada por habilidade e posição) ou aleatório, com ajuste manual por arrastar e soltar. |
| 💵 | **Rateio** | Gestão do fundo: participantes, pagamentos e status de cada um. |
| ↩️ | **Retiradas** | Histórico de desistências com horário e motivo. |
| ⚙️ | **Configurações** | Dia/hora de abertura da lista, limites de vagas, janela de prioridade, penalidades e automações. |

### 🤖 Automação

- **Rodadas automáticas** — a próxima rodada é criada e aberta sozinha no dia e horário configurados
  (via `pg_cron`, fuso `America/Sao_Paulo`), com garantia de idempotência.
- **Fila de notificações** — envios push processados por uma outbox no banco, com registro de entrega.
- **Auditoria** — toda ação administrativa fica registrada em log.

---

## 🧱 Stack

```
┌─────────────────────────────────────────────────────────┐
│  Frontend   React 19 · TanStack Start/Router · Query    │
│  UI         Tailwind CSS v4 · shadcn/ui · Radix · dnd-kit│
│  Server     TanStack Server Functions (SSR)             │
│  Backend    Supabase — Postgres · Auth · RLS · RPCs     │
│  Jobs       pg_cron                                     │
│  Push       Web Push (VAPID) + Service Worker           │
└─────────────────────────────────────────────────────────┘
```

**Destaques de arquitetura**

- Toda regra de negócio sensível roda em **RPCs no Postgres** com **Row Level Security** ativo.
- O cliente nunca acessa o banco diretamente para operações administrativas: elas passam por
  **server functions** que validam a role `admin` antes de executar.
- Administradores usam **Supabase Auth** (e-mail/senha); jogadores usam **sessão própria por PIN**.

---

## 🚀 Rodando localmente

### Pré-requisitos

- **Node.js 22+** (obrigatório — versões anteriores quebram o cliente do Supabase no servidor)
- [Bun](https://bun.sh) (ou `npx bun`) para instalar as dependências
- Um projeto no [Supabase](https://supabase.com)

### 1. Clone e instale

```bash
git clone <url-do-repositorio>
cd sepassoueponto
bun install        # ou: npx bun install
```

### 2. Configure o ambiente

Crie um arquivo `.env` na raiz:

```env
SUPABASE_PROJECT_ID="seu-project-id"
SUPABASE_URL="https://seu-project-id.supabase.co"
SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."

VITE_SUPABASE_PROJECT_ID="seu-project-id"
VITE_SUPABASE_URL="https://seu-project-id.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."

# Opcional — notificações push
VAPID_PUBLIC_KEY="..."
VAPID_PRIVATE_KEY="..."
VITE_VAPID_PUBLIC_KEY="..."
```

> ⚠️ **Nunca** faça commit do `.env`. A `SUPABASE_SERVICE_ROLE_KEY` ignora o RLS e dá acesso total ao banco.

### 3. Prepare o banco

Aplique as migrations da pasta [`supabase/migrations`](supabase/migrations) no seu projeto
(via [Supabase CLI](https://supabase.com/docs/guides/cli) com `supabase db push`, ou restaurando um backup).

Depois, crie seu usuário admin em **Authentication → Users** e dê a ele a role:

```sql
insert into public.user_roles (user_id, role)
values ('<uuid-do-usuario>', 'admin');
```

### 4. Suba o servidor

```bash
npm run dev
```

Acesse **http://localhost:8080** (app do jogador) e **http://localhost:8080/admin/login** (painel).

### Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento com hot reload |
| `npm run build` | Build de produção |
| `npm run preview` | Pré-visualiza o build |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

---

## 📁 Estrutura

```
src/
├── routes/
│   ├── index.tsx             # App do jogador (página única com seções)
│   ├── admin.login.tsx       # Login administrativo
│   ├── _admin/               # Painel protegido + abas
│   └── api/                  # Endpoints (cadastro, gatilho de push)
├── components/               # Componentes de negócio e UI (shadcn)
├── lib/
│   ├── *.functions.ts        # Server functions (admin, jogadores, rateio, push…)
│   └── skills.ts             # Posições e algoritmo de equilíbrio dos times
├── integrations/supabase/    # Clientes Supabase (browser, servidor, middleware)
└── hooks/
supabase/
└── migrations/               # Schema, RPCs, RLS e jobs
public/
└── sw-push.js                # Service Worker de notificações
```

---

## 📜 Regras de negócio principais

1. **Prioridade** dá acesso antecipado à lista, mas não garante vaga — o limite continua valendo.
2. Cada jogador inscreve **a si mesmo + 1 convidado**.
3. **Saída após o horário de corte** gera ocorrência e penalidade automáticas.
4. **Promoção da reserva** é automática e segue a ordem de chegada.

---

## 📚 Documentação

- [`DOCUMENTACAO_TECNICA_FUNCIONAL_UNIFICADA_SE_PASSOU_E_PONTO.md`](DOCUMENTACAO_TECNICA_FUNCIONAL_UNIFICADA_SE_PASSOU_E_PONTO.md) — inventário completo de rotas, telas, RPCs, tabelas e fluxos
- [`DOCUMENTACAO_TECNICA.md`](DOCUMENTACAO_TECNICA.md) — visão técnica
- [`TESTING.md`](TESTING.md) — guia de testes
- [`roadmap.md`](roadmap.md) — próximos passos

---

<div align="center">

Feito com 💛 para quem não deixa a bola cair.

**Se passou, é ponto.** 🏐

</div>
