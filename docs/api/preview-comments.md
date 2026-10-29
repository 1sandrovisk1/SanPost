# Comentários no preview e exclusão de organização

## Contrato de comentários

- `GET /public/posts/:id/comments`: `{ comments, anonymousEnabled, recaptchaSiteKey }`. Apenas campos de exibição, sem identidade da equipe, e-mail de convidado, IP, organização ou token de revisão.
- `POST /public/posts/:id/comments`: `{ content, displayName, recaptchaToken, postId?, parentId?, anchorStart?, anchorEnd?, anchorQuote? }`. Anônimo publica somente COMMENT, exige reCAPTCHA v2 configurado e válido no hostname da instância e limites Redis. Sem configuração, 404. Falha de Redis, 503. Excesso, 429.
- `POST /posts/:id/comments`: membro, contrato existente `comment/kind` acrescido da mesma localização opcional. Aprovar/pedir alteração não aceita localização nem resposta. Perfil validado no servidor.
- `POST /public/posts/:id/review/comment`: contrato existente com token, nome e e-mail; aceita localização/resposta. Aprovação continua exigindo link válido e permissão allowApprove.
- `PUT /posts/:id/comments/:commentId/resolve`: `{ resolved: boolean }`; somente equipe com acesso de escrita ao perfil, somente conversa raiz COMMENT.
- `DELETE /posts/:id/comments/:commentId`: equipe com acesso de escrita ao perfil; exclusão lógica da conversa e respostas.

Respostas pertencem à mesma thread, não podem responder a outra resposta nem a conversa resolvida. Offsets inteiros indexam textContent do HTML sanitizado; quote precisa coincidir com o texto atual. Após edição, a citação permanece visível, mas destaque só ocorre se ainda corresponder.

Comentários públicos são texto simples. O nome informado por visitante não prova identidade e recebe o selo Anônimo. A identidade da equipe permanece apenas no caminho autenticado.

## Contrato de exclusão

A exclusão de organização fica restrita ao administrador da plataforma (`User.isSuperAdmin`), independente de role SUPERADMIN da organização. `GET /settings/organization/deletion` retorna `{ id, name, billingBlocked }` para a organização ativa. `DELETE /settings/organization` exige `{ confirmationName }` igual ao nome atual e revalida o administrador no banco. Role SUPERADMIN da organização não basta; a tela fica oculta durante impersonação.

A transação serializável marca Organization.deletedAt, revoga chave da organização, chaves de perfil, autorizações/códigos OAuth e links de revisão; desativa canais, posts, RSS, fluxos e reposts e desabilita vínculos de membros. As contas User e os dados históricos são preservados. Não há restauração nem exclusão física nesta entrega.

Assinatura com cobrança ainda vigente bloqueia a operação com 409: cancelar pela administração de cobrança e aguardar o efeito do cancelamento. A exclusão não chama o Stripe nem assume cancelamento apenas pela intenção do usuário.

Os resolvers de sessão, chave de org, chave de perfil e OAuth/MCP recusam organizações excluídas. A activity de publicação V102 verifica o canal no banco antes de usar o snapshot do histórico; V112 também carrega o canal vigente. Uma chamada já aceita por uma rede social antes do commit não pode ser recolhida por esta operação.

## Migração e rollback

Alterações aditivas: aplicar `20261028_preview_comments/migration.sql` e `20261029_organization_deletion/migration.sql` (ou o db push controlado do projeto) antes de iniciar a versão nova. Não foi aplicado SQL em banco existente nesta implementação. Gerar Prisma localmente não altera o banco.

Rollback de código depois de excluir uma organização exige manter os filtros de tombstone ou restaurar os registros de maneira controlada; código antigo não conhece Organization.deletedAt. Não remover as colunas com dados de comentários nem reativar organizações implicitamente.

## CAPTCHA

Usar chaves de reCAPTCHA v2 checkbox válidas para o hostname de FRONTEND_URL. A secret só existe no backend. A validação exige sucesso e hostname correto, com timeout; tokens expiram e são de uso único conforme [documentação oficial](https://developers.google.com/recaptcha/docs/verify). Cada tentativa de envio pede nova verificação. Com keys vazias, leitura pública e revisão por link continuam funcionando, mas a escrita anônima fica fechada.
