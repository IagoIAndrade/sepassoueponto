# Política de Testes

Este projeto **não possui ambiente de teste isolado**. O preview e a produção
compartilham o mesmo banco Supabase configurado nas variáveis do projeto.

## Proibido

É **proibido** executar testes automatizados com escrita (Playwright, Cypress,
Vitest com fetch real, scripts de navegador, curl POST/PATCH/DELETE, etc.)
contra o Supabase configurado no preview ou em produção. Isso inclui, sem
limitação:

- criar jogadores, inscrições, rodadas, bloqueios, sessões ou qualquer outro
  registro pelo fluxo público ou administrativo;
- alterar ou apagar dados existentes;
- disparar RPCs que produzam efeitos colaterais (`internal_signup_player`,
  `admin_*`, `tick_events`, etc.).

## Permitido

Validações no ambiente atual devem ser **somente leitura**:

- inspeção do banco via `supabase--read_query`;
- navegação no preview sem submeter formulários que gravem dados;
- leitura de logs, screenshots, network e console.

## Escrita em testes

Qualquer teste que precise gravar exige um ambiente separado:

- Supabase local (`supabase start`) ou um projeto Supabase dedicado a testes;
- variáveis próprias (`TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`,
  `E2E_BASE_URL`, `APP_ENV=test`) com proteção fail-closed que aborta se as
  variáveis apontarem para o Supabase de produção.

## Pendência técnica

Provisionar staging isolado, configurar as variáveis de teste e adicionar a
verificação fail-closed antes de qualquer suíte automatizada com escrita.
Enquanto isso não existir, siga a política acima.
