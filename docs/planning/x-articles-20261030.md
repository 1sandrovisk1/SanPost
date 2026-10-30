# Porte de X Articles — 30/10/2026

Escopo autorizado: artigos longos do X, sobre a integração `2cadddd0`. Sem clipping, cobrança, Apple ou deploy. Base Postiz `173f92ed`, `19471a4a`, `a4088abc` e correções posteriores, adaptadas ao provider síncrono do fork (V102/V112 existentes).

## Contrato antes do código

- `XDto`: `post_type` opcional `post|article` (legado continua post), `article_title` obrigatório para artigo, `article_status` obrigatório `draft|published`, capa opcional `article_cover: MediaDto`. Credenciais OAuth1 existentes por perfil/workspace preservadas.
- Artigo usa HTML do compositor, convertido no provider para `content_state` DraftJS snake_case. Parágrafos, títulos, listas, negrito, sublinhado e links HTTP(S). Imagens inline apenas da biblioteca da instância, capa separada e anexos de imagem ao final; vídeos recusados antes do agendamento. Limite interno de 100.000 caracteres para artigo; tweets conservam limites atuais.
- Provider X recebe HTML e converte tweets/comentários para o mesmo texto do fluxo antigo. Publicação de artigo: upload de imagens JPEG `tweet_image`, criar draft (`POST /2/articles/draft`), opcionalmente publicar (`POST /2/articles/{id}/publish`). Toda mutação final é uma tentativa; rede/5xx/JSON inválido/ID ausente são terminais e sanitizados. Após draft confirmado, qualquer falha ao publicar preserva o ID/URL pelo `PublishedWithError` já consumido em V102/V112, impedindo duplicação automática. Sem transplante dos workflows pendentes do upstream.
- Interface: seletor Post/Artigo, título, status com distinção explícita de rascunho no X e capa. Formatação e imagens inline no artigo, limite/contador reativos às settings. Não expor opção para provider alternativo que não suporte. Rascunho de artigo no X não permite comentários; artigo publicado permite respostas como tweets.
- Validar no serviço comum de criação/edição/API/MCP e no sink provider. Ao agendar rascunho pelo calendário, validar conteúdo persistido também. Nenhum caminho pode publicar apenas parte de uma cadeia incompatível.
- Segurança de mídia: confinamento realpath de arquivos locais, SSRF para remotos, limite de bytes e tempo antes do primeiro efeito externo. Imagens inline externas são removidas conforme política existente. Sem token, Consumer Secret ou erro cru em histórico/log.
- Testes RED/GREEN: contrato DTO/condicionais, conversão HTML/DraftJS e imagens próprias, caminho tweet sem regressão, payloads/IDs/erros parciais, credenciais, gates de consumidores, limite reativo da UI. Browser desktop/mobile com fixture local, três builds, revisões de código/segurança e aceitação. Sem publicação real.

## Referências

- [API oficial](https://docs.x.com/x-api/articles/introduction)
- [Criar rascunho](https://docs.x.com/x-api/articles/create-draft-article)
- [Publicar artigo](https://docs.x.com/x-api/articles/publish-article)

## Entrega e validação

- Implementados DTO, provider nativo, HTML/DraftJS, capa e imagens próprias, capabilities API/MCP, settings pt/en e limites reativos do compositor. Sem nova dependência, migração Prisma, variável de ambiente ou alteração dos workflows.
- Gates em create/mapTypeToPost/changeDate validam provider real, cadeia ordenada, rascunho sem respostas, tipo de mídia e limites de corpo/respostas. O calendário consulta a cadeia recursiva, e API/MCP recusam imagem inline em resposta (use anexos); o sink de comentário repete a proteção.
- 269 testes backend em 28 suítes passaram: X legado/artigos, DTO/sanitização, DraftJS com UTF16/links/listas, imagens próprias/upload JPEG, cap de bytes/symlinks/SSRF/diretório ausente, ID longo, resultado parcial/incerto, native-only e consumidores de posts/calendário/MCP. Transformação Jest isolada com tipagem validada separadamente pelos builds.
- 9 testes Vitest passaram (incluindo os 6 do lote social anterior). O teste novo cobre troca de formato/limite/título/status, Zernio e rascunho com respostas.
- Browser em 1280 e 390 px, com wrapper real do provider, ref `isValid()` real e editor TipTap: Post→Artigo→Post atualiza contador e o limite retornado ao salvamento; título/status/formatação preservados. Sem overflow horizontal ou exceções de página. Screenshot mobile conferida. API de fixture local; nenhuma chamada ao X nem credencial real. Rota de QA, arquivo AGENTS gerado e servidores temporários removidos.
- Builds de produção backend, frontend e orchestrator aprovados. Node local 22.22.3 emite aviso por estar abaixo do mínimo declarado 22.23.4; não foi alterado o runtime do projeto.
- Revisões de código e segurança fecharam o ref com limite antigo, ordenação da cadeia, contagem ponderada indevida no corpo e leitura do cwd sem UPLOAD_DIRECTORY. Esta última foi reproduzida em RED com PNG controlado e corrigida em GREEN. Aceitação final fechou a perda de imagem inline nas respostas por API/MCP.
- Lint permanece com a dívida de configuração registrada no lote social anterior: não há script lint na raiz e ESLint 8.57 não carrega o plugin React devido a estrutura circular. Não foi alterada a configuração de lint neste porte.
- Doc-maintainer propôs atualizar os mapas/pitfalls dos CLAUDE.md para registrar X Articles, contagem/ref reativos e falha após draft remoto confirmado; propostas de instruções não foram aplicadas sem aprovação e não bloqueiam a feature.

Comandos reproduzíveis:

```sh
pnpm exec jest --selectProjects nestjs-libraries --runInBand --globals '{"ts-jest":{"isolatedModules":true}}' --testPathPattern='database/prisma/posts/.*service.*spec|integrations/social/(x.article.*spec|x.provider.spec|zernio.*spec)|chat/tools/__tests__/integration.schedule.post.spec'
pnpm exec vitest run --config tools/vitest.social-extras.config.mts
pnpm build:backend
pnpm build:frontend
pnpm build:orchestrator
```

Operação e limites: [guia de X Articles](../operations/x-articles.md). O provider síncrono evita replay das **falhas capturadas**, preservando o ID do draft quando conhecido. Crash entre aceite remoto e gravação continua sem garantia de exatamente uma criação. A publicação real depende das permissões da conta/app X e ainda não foi testada.
