# Plano de Restauração — Fluxo do Jogador Mobile

Este plano visa restaurar a interface móvel completa para jogadores, corrigindo o erro onde o botão "ENTRAR" não avança para o login/cadastro.

## Mudanças Técnicas

### Frontend
- **src/routes/index.tsx**: Restaurar a lógica de abas mobile (`inicio`, `lista`, `times`), o seletor de grupos e a integração com o `AuthDialog`.
- **src/components/AuthDialog.tsx**: Garantir que o componente recém-criado suporte o fluxo de 4 passos de cadastro (Dados, Turmas, Foto, Concluir).
- **Subcomponentes**: Integrar `PlayerRoundStatusCard`, `EventContextCard` e `MobileNavBar` na visualização autenticada do jogador.

### Fluxo de Autenticação
- Implementar o tratamento do parâmetro `?view=login` na URL para abrir o diálogo de autenticação automaticamente.
- Garantir que a sessão do jogador (Cookie/PIN) seja atualizada dinamicamente sem necessidade de recarregar a página.

## Detalhes de Implementação

1.  **Recuperação de Lógica**: Injetar os hooks e derivações de estado (inscrições, posição na lista, contadores de tempo) recuperados do histórico no `Index` componente.
2.  **Visualização Condicional**:
    - Se `me` não existe: Mostrar tela de boas-vindas com botão "ENTRAR".
    - Se `me` existe: Mostrar layout mobile com navegação inferior e conteúdo da aba ativa.
3.  **Gestão de Acesso**: Manter o bloqueio visual para jogadores não aprovados em turmas restritas, oferecendo o botão de "Solicitar Acesso".
