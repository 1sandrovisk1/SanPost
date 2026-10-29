# Validação dos dois pendentes — 29/10/2026

## Entrega

Branch local `maiconramos/resume-preview-org`, criado a partir de `fix/rc3-tags-temporal-2026-10`. Rascunho anterior de comentários reaproveitado sem modificar o worktree da sessão anterior. As duas funcionalidades estão implementadas e documentadas em [Contrato e operação](../api/preview-comments.md).

- Comentários anônimos, respostas e citação de trechos no preview; equipe resolve, reabre e exclui conversas com escopo de perfil. Revisão e aprovação por link preservadas. Leitura pública sem identidade privada da equipe.
- Exclusão lógica de organização restrita ao administrador da plataforma (`User.isSuperAdmin` conferido no banco). Confirmação exata do nome, bloqueio de assinatura vigente, revogação transacional de acessos e desativação de canais/posts/automações. Contas de usuários e histórico preservados.

## Verificações automatizadas

- Rodada final de todos os specs alterados/criados: **130 testes passaram** — biblioteca 97 (14 suítes), backend 15 (2 suítes), orchestrator 18 (1 suíte).
- Regressões existentes de Organization/Profile/OAuth/Integration: 58 testes passaram em rodada adicional (há sobreposição com os specs acima; não somar como testes únicos).
- Builds de frontend, backend e orchestrator passaram. O build final de frontend foi repetido após remover a rota temporária de QA.
- `git diff --check` e `docker compose -f docker-compose.yaml config --quiet` passaram.
- Auditoria de segurança e revisão de aceitação final não encontraram bloqueadores remanescentes nos caminhos examinados.

## PostgreSQL 17 real e isolado

Container temporário com banco vazio; schema aplicado apenas nele. A execução real da repository/service confirmou:

1. Um SUPERADMIN da organização sem `User.isSuperAdmin` recebe 403 sem mutação.
2. Nome de confirmação diferente recebe 400.
3. Exclusão autorizada marca a organização e o perfil, limpa chaves e desativa memberships.
4. App OAuth próprio e seu grant para outra organização são revogados.
5. As duas contas User continuam presentes; a outra organização continua ativa.

Container removido após o teste. Nenhum banco existente recebeu SQL ou `db push`.

## Navegador

Componentes reais renderizados em frontend local isolado (porta 4327), com API de fixture (6431). A rota auxiliar temporária foi removida e os servidores encerrados.

- Comentário anônimo e resposta enviados com o payload correto e rótulo Anônimo.
- Clique na citação selecionou o texto real; seleção de texto gerou os offsets/quote do novo comentário.
- Membro resolveu e reabriu conversa; excluir a raiz removeu também a resposta da lista.
- Exclusão de organização: botão desabilitado com campo vazio/nome errado, habilitado com nome exato; DELETE enviou apenas confirmationName.
- Captura visual revisada para ambas as telas. O widget CAPTCHA foi simulado; a verificação real do Google foi exercitada por mocks de contrato/hostname nos testes de backend, sem resolver desafio externo nem usar chaves reais.
- Um aviso de imagem vazia veio da fixture sem avatar; um bloqueio inicial de HMR foi resolvido usando origem local permitida. Não foram observados erros funcionais dos fluxos após ajustar a fixture.

## Ativação e limites

- Produção não foi alterada. Não houve push, abertura de PR, merge nem deploy nesta entrega.
- Aplicar as duas migrações aditivas antes de executar a versão nova; ver o contrato para rollback.
- Escrita anônima permanece fechada até configurar `RECAPTCHA_SITE_KEY` e `RECAPTCHA_SECRET_KEY` de v2 checkbox para FRONTEND_URL. As variáveis estão documentadas e encaminhadas no compose; a secret não vai ao navegador.
- Node local: 22.22.3; o projeto declara mínimo 22.23.4. Repetir os checks de release na versão declarada.
- Lint continua com a limitação já diagnosticada: package.json não tem script lint e ESLint direto falha na configuração existente do plugin React. Não há aprovação de lint nesta entrega.

## Instruções do repositório

O doc-maintainer propôs registrar em CLAUDE.md os contratos novos, filtros de tombstone, projeção pública e guards V102. Essas instruções não foram modificadas sem aprovação; os contratos e o runbook em docs/ foram atualizados.
