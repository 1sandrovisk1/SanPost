---
name: sync-upstream
description: Sincronizar o fork Robo MultiPost com o repositorio upstream Postiz. Guia passo a passo com fetch, merge na branch postiz, merge em main, resolucao de conflitos e verificacao de build.
argument-hint: "[--dry-run] — simular sem executar merges"
---

# Sync Upstream — Postiz -> Robo MultiPost

Voce esta guiando o usuario pela sincronizacao com o upstream Postiz.
Este e um processo delicado que requer atencao a conflitos. Siga cada passo.

## Verificacao de Precondicoes

Antes de tudo, verifique TODAS as condicoes:

```bash
# 1. Branch atual
git branch --show-current

# 2. Working tree limpo
git status --porcelain

# 3. Remote upstream existe
git remote get-url upstream 2>/dev/null

# 4. Branches postiz e main existem
git branch --list postiz main
```

**Se qualquer precondicao falhar:**
- Branch != main -> `git checkout main`
- Working tree sujo -> avisar e pedir para commitar ou stash
- Upstream nao existe -> `git remote add upstream https://github.com/gitroomhq/postiz-app`
- Branch postiz nao existe -> avisar (problema grave)

## Passo 1: Fetch Upstream

```bash
git fetch upstream
git fetch origin
```

Depois mostre ao usuario:

```bash
# Quantos commits novos no upstream
git log --oneline postiz..upstream/main | wc -l

# Listar os commits (ultimos 20)
git log --oneline postiz..upstream/main | head -20

# Procurar breaking changes
git log --oneline postiz..upstream/main | grep -iE "BREAKING|!"
```

Apresente um resumo:
- N commits novos no upstream
- Quaisquer breaking changes encontradas
- Perguntar se deseja prosseguir

**Se `--dry-run` foi passado como argumento:** pare aqui e mostre apenas o resumo.

## Passo 2: Atualizar Branch postiz

```bash
git checkout postiz
git merge upstream/main
```

**Se merge limpo:**
- Reportar sucesso
- Mostrar `git diff --stat HEAD~1` (arquivos alterados)

**Se merge com conflitos:**
- Isso NAO deveria acontecer (postiz e espelho limpo)
- Se acontecer, algo esta errado — alguem commitou na branch postiz
- Listar conflitos e recomendar `git merge --abort`
- Investigar o que foi commitado indevidamente

Apos merge bem-sucedido:
```bash
git push origin postiz
```

## Passo 3: Merge postiz em main

```bash
git checkout main
git merge postiz
```

**Se merge limpo:**
- Reportar sucesso
- Listar arquivos alterados com `git diff --stat HEAD~1`

**Se merge com conflitos:**
- Listar TODOS os arquivos conflitantes:
  ```bash
  git diff --name-only --diff-filter=U
  ```

- Agrupar por area e dar orientacao especifica:

  | Area | Arquivos | Orientacao |
  |------|----------|-----------|
  | Frontend | `apps/frontend/` | Manter nossas customizacoes de UI/branding, aceitar novas features |
  | Traducoes | `libraries/react-shared-libraries/src/translation/` | Manter nossas traducoes pt-BR, adicionar chaves novas do upstream |
  | Backend | `apps/backend/`, `libraries/nestjs-libraries/` | Geralmente aceitar upstream, verificar se nao quebra integracao |
  | Config | `package.json`, `tsconfig*` | Aceitar deps do upstream, manter metadados do fork (nome, versao) |
  | CI/CD | `.github/workflows/` | Manter nosso registry (maiconramos), aceitar melhorias de workflow |
  | Docs | `README.md`, `docs/` | Manter nosso README, aceitar docs novos |
  | Branding | Logos, imagens | Sempre manter os nossos |

- Para cada conflito, mostrar o conteudo conflitante e sugerir resolucao
- Pedir confirmacao antes de cada resolucao

Apos resolver todos os conflitos:
```bash
git add .
git commit -m "chore: sync upstream postiz ($(git log -1 --format=%h upstream/main))"
```

## Passo 4: Verificacao de Build

Perguntar ao usuario se deseja rodar o build (demora):

```bash
pnpm install
pnpm build
```

**Se build OK:** reportar sucesso
**Se build falhar:** analisar erro e orientar correcao

## Passo 5: Gerar Entrada no Changelog

Ler os commits upstream que foram mergidos. Criar uma entrada sugerida para
a secao `### Upstream` do CHANGELOG.md:

```markdown
### Upstream
- Sincronizado com Postiz upstream ate commit <hash> (<data>)
- Principais mudancas: <resumo das features/fixes mais relevantes>
```

Apresentar a entrada e perguntar se deseja adicionar ao CHANGELOG.md.

## Passo 6: Resumo Final

```
=== Sync Upstream Concluido ===

Commits mergidos:       N
Conflitos resolvidos:   N (ou nenhum)
Build:                  OK / Nao executado / Falhou
Changelog:              Atualizado / Nao atualizado

Proximos passos:
- Testar a aplicacao localmente (pnpm dev)
- Quando estiver satisfeito, considere usar /new-release para publicar
- NAO faca push de main ainda se quiser testar mais
```

## Customizacoes Divergentes do Upstream (nao sobrescrever!)

Esta secao lista correcoes e customizacoes aplicadas no fork que NAO existem
no upstream Postiz. Ao resolver conflitos ou ao aceitar mudancas do upstream
em qualquer um dos arquivos abaixo, **leia esta secao antes**, e confirme com
o usuario que nao estamos regredindo uma correcao ja feita.

Formato: **arquivo** — descricao + data em que verificamos que o upstream
continuava bugado. Se o upstream eventualmente corrigir, remova o item desta
lista durante o proprio sync e registre no CHANGELOG.

### Bugs de upload de midia / erros engolidos no X provider (2026-04-10)

- **`libraries/nestjs-libraries/src/integrations/social/x.provider.ts`** —
  metodo `uploadMedia` (proximo linha 350-395 no nosso fork).
  - **Bug upstream (duplo):**
    1. Usa `client.v2.uploadMedia` da lib `twitter-api-v2`, que bate no
       endpoint NOVO X API v2 `/2/media/upload/initialize` (chunked). Esse
       endpoint requer tier pago ou OAuth 2.0 com escopo `media.write` e
       **nao funciona em contas do tier Free**, que so tem acesso ao endpoint
       legado v1.1 `/1.1/media/upload.json`. No tier Free a chamada falha
       com "Unknown Error" no wrapper do `runInConcurrent`.
    2. Convertia TODA imagem nao-mp4 para GIF via
       `sharp(...).resize({width:1000}).gif().toBuffer()`, mas passava
       `media_type: (lookup(m.path) || '')` (MIME do arquivo original, ex.
       `image/png`). Buffer GIF com MIME PNG e rejeitado pelo X.
  - **Nosso fix:**
    1. Migrado para `client.v1.uploadMedia(buffer, { mimeType })` — endpoint
       v1.1 que funciona em todos os tiers. Media IDs do v1.1 sao aceitos
       pelo `client.v2.tweet` (media IDs sao globalmente validos no X).
    2. Buffer e `mimeType` agora sao coerentes por formato:
       - video/mp4 -> buffer cru + `video/mp4`
       - image/gif animado -> `sharp({animated:true}).gif()` + `image/gif`
       - image/png -> `sharp().png()` + `image/png`
       - image/webp -> `sharp().webp()` + `image/webp`
       - outros -> `sharp().jpeg()` + `image/jpeg`
  - **Ao sincronizar:** verificar o upstream atual com
    `git show upstream/main:libraries/nestjs-libraries/src/integrations/social/x.provider.ts | grep -A 5 "uploadMedia"`.
    - Se ainda usar `client.v2.uploadMedia`: **NAO** aceite a versao upstream.
      Mantenha o nosso `client.v1.uploadMedia`.
    - Se ainda usar `.gif()` hardcoded: mantenha o nosso fluxo por formato.
    - Se o upstream tiver corrigido os dois pontos, adote a versao upstream e
      remova este item da lista.

- **`libraries/nestjs-libraries/src/integrations/social/x.provider.ts`** —
  metodos `getClient`, `post`, `comment`, `autoRepostPost`, `repostPostUsers`,
  `autoPlugPost`, `analytics`, `postAnalytics`, `mention` e helper privado
  `resolveAppKeys`.
  - **Bug upstream:** hardcodam `process.env.X_API_KEY!` e
    `process.env.X_API_SECRET!` em todos os pontos, impossibilitando uso de
    Consumer Keys por perfil (feature do fork — cada Profile tem suas
    proprias credenciais OAuth via `ProviderCredential`).
  - **Nosso fix:** helper `resolveAppKeys(integration?)` decripta
    `integration.customInstanceDetails` (armazenado pelo controller via
    `AuthService.fixedEncryption`) e cai para env var como ultimo recurso.
    Todos os metodos acima aceitam `integration?: Integration` para encadear
    as credenciais corretas ate o `TwitterApi`.
  - **Assinaturas alteradas:** `post` ganhou 4o parametro `integration?`,
    `analytics/postAnalytics` ganharam ultimo parametro `integration?`, e a
    interface `SocialProvider` em `social.integrations.interface.ts` foi
    atualizada para refletir isso.
  - **Ao sincronizar:** conflitos em `x.provider.ts`, `instagram.provider.ts`
    (analytics/postAnalytics), `instagram.standalone.provider.ts`,
    `social.integrations.interface.ts`, `integration.service.ts` (caller de
    `analytics`) e `posts.service.ts` (caller de `postAnalytics`) devem
    preservar as assinaturas estendidas com `integration?: Integration`.

- **`libraries/nestjs-libraries/src/integrations/social.abstract.ts`** —
  metodo `runInConcurrent` (aprox. linhas 74-99).
  - **Bug upstream:** o `catch` envolve qualquer exception em
    `BadBody('Unknown Error')` SEM logar o erro original. Resultado: falhas
    reais de APIs de provider (X, Facebook, etc) aparecem no Temporal como
    "Unknown Error" sem stack trace nem mensagem do provider.
  - **Nosso fix:** adicionado `console.error('[runInConcurrent] provider error:', ...)`
    logando `err.data`, `err.message` e `err.stack` antes do `handleErrors`,
    para que o worker do orchestrator mostre a causa real no terminal / docker
    logs.
  - **Ao sincronizar:** se o upstream tambem nao estiver logando, preserve
    nosso `console.error`. Se o upstream introduziu log proprio, aceitar a
    versao upstream desde que o erro original seja visivel nos logs.

### Credenciais OAuth por perfil (feature do fork, nao upstream)

- **`libraries/nestjs-libraries/src/database/prisma/credentials/credential.service.ts`** —
  metodo `validateCredential` case `twitter`.
  - **Contexto:** o fork suporta credenciais OAuth por perfil via UI de
    Configuracoes. O teste de credenciais do X usa
    `new TwitterApi({appKey, appSecret}).appLogin()` da lib `twitter-api-v2`
    (que resolve o endpoint correto v1.1 `/oauth2/token`). O upstream Postiz
    nao tem esse fluxo de teste; se ele introduzir algo parecido, verifique
    que continua usando o helper da lib em vez de `fetch` direto contra URL
    hardcoded (veja historia: versao anterior do nosso codigo batia em
    `https://api.x.com/oauth2/token`, endpoint inexistente).
  - **Arquivos correlatos nao-upstream:**
    `apps/frontend/src/components/settings/provider-credential-form.component.tsx`,
    endpoints `/credentials/:provider/test` em
    `apps/backend/src/api/routes/credentials.controller.ts`.

### Lote de providers Meta (2026-10-25) — divergencias deliberadas

- **`libraries/nestjs-libraries/src/integrations/social/instagram.provider.ts`** —
  o upstream moveu o polling de container para o workflow e usa um tipo
  `disconnect` no checkpoint da Meta. O fork mantem o loop V102 dentro de
  `post()` (cadencia de 30 s apos cada checagem) e so extraiu `igContainerStatus`;
  o checkpoint mapeia para `refresh-token` (self-heal por Usuario do Sistema).
  `instagram.standalone.provider.ts` converte esse caso em `bad-body` pela
  subclasse `InstagramLoginDelegate` (hook `metaCheckpointError`), porque
  `this.fetch`/`igContainerStatus` consultam o `handleErrors` do delegate, nao
  o do standalone. Nao reintroduzir `Disconnect`.
- **`libraries/nestjs-libraries/src/integrations/social/facebook.provider.ts`** —
  `videoPostAnalytics` usa `analyticsFetch` (SSRF/DNS pinning), nao o `fetch`
  cru do upstream; o bloco de mapeamentos novos fica ANTES do `indexOf('490')`,
  o 190/459 (checkpoint) e `refresh-token` (self-heal, como no Instagram; o
  upstream falha o post) e os catch-alls `(#200)` / "Sorry, something went
  wrong" ficam por ULTIMO para nao sombrear subcodes especificos (1404078).
- **`libraries/nestjs-libraries/src/integrations/social.abstract.ts`** —
  `fetch()` com retentativas esgotadas lanca `BadBody` com a mensagem curada de
  `handleErrors` (upstream lanca vazio).
- **`libraries/helpers/src/utils/count.length.ts`** + `manage.modal.tsx` +
  `information.component.tsx` + `integration.schedule.post.ts` — uma unica
  regra de contagem (`countLength`, com `zernio-twitter`/`zernio-threads`
  normalizados para a rede de destino e `countLengthUnit` nas mensagens); o
  upstream so trocou o contador e mantem o `max(peso, caracteres)` no gate,
  que bloqueia posts do X com URL. Nao reintroduzir o `max()`.
- **`apps/frontend/src/components/new-launch/providers/facebook/facebook.provider.tsx`** —
  o campo de titulo de video so aparece para `facebook` nativo (o componente e
  compartilhado com `zernio-facebook`).

### Lote de providers YouTube/Pinterest/TikTok (2026-10-25) — divergencias deliberadas

- **`libraries/nestjs-libraries/src/integrations/social/tiktok.provider.ts`** —
  o upstream resolve o publish_id no `checkPending` do workflow; o fork mantem
  o polling em `uploadedVideoSuccess` (`fetch` de publicacao) e `resolveReleaseId`
  usa `analyticsFetch` (leitura de analytics, SSRF-safe). `postAnalytics` so
  devolve vazio para `_pub_` nao resolvido (a resolucao e persistida por
  `PostsService.resolveRelease`). `video_cover_timestamp_ms` vai em `post_info`.
- **`apps/frontend/src/components/new-launch/providers/tiktok/tiktok.provider.tsx`** —
  a pre-checagem de imagens (>1080px no lado menor) e client-side (o fork nao
  adotou o `checkValidity` server-side com sharp do upstream); imagem que nao
  carrega ou demora 5 s nao bloqueia o envio; so roda quando o `identifier`
  (5o argumento do `checkValidity`, novo no HOC) e `tiktok` — o zernio-tiktok
  compartilha o componente e o Zernio redimensiona por conta propria.
  `uploadedVideoSuccess` tem polling limitado (90 x 10 s) e `refreshToken`
  recebe `ClientInformation`.
- **`libraries/nestjs-libraries/src/dtos/posts/providers-settings/zernio-pinterest.dto.ts`** —
  DTO proprio do zernio-pinterest com o contrato antigo (board string
  obrigatorio, sem `@Matches`); o upstream nao tem canais Zernio.
- **`libraries/nestjs-libraries/src/chat/tools/settings.value.coercion.ts`** —
  `coerceSettingValue` mantem cruas as chaves que o DTO declara com
  `@IsString` (ids); o upstream faz `JSON.parse` em tudo.
- **`libraries/nestjs-libraries/src/dtos/posts/providers-settings/pinterest.dto.ts`** —
  `@Matches` fica ACIMA do `@MinLength` (registro de baixo para cima; o Select
  mostra so a primeira mensagem). Nao reordenar ao aceitar o upstream.
- **`libraries/nestjs-libraries/src/chat/tools/integration.schedule.post.ts`** —
  o fork nao tem `post.settings.tool.ts`; a orientacao "id, nunca o label" vive
  so na descricao do `value` desta tool (texto do fork, com `tryParseJson`).

### Lote de providers pequenos (2026-10-26) — divergencias deliberadas

- **`libraries/nestjs-libraries/src/integrations/social/reddit.provider.ts`** —
  o upstream trata RATELIMIT rearmando a lane `checkPending`; o fork mantem o
  loop em `post()` e espera dentro de um orcamento de 180 s por activity
  (`submitWithRateLimit`), reenviando o mesmo subreddit — um `throw` faria o
  V102 reexecutar o loop e duplicar os subreddits ja publicados. Nao
  reintroduzir `armed`/`pendingData`.
- **`libraries/nestjs-libraries/src/integrations/social/x.provider.ts`** —
  "Too Many Requests" e `bad-body` curado (o X roda por `runInConcurrent`, que
  nao retenta `retry`); o upstream mapeia como `retry`.
- **`libraries/nestjs-libraries/src/integrations/social/lemmy.provider.ts`** —
  `getJwtAndService` usa `this.fetch` (SSRF-safe por dentro, sem `dispatcher`)
  e relanca a falha de login sem o corpo (senha); `authenticate()` continua em
  `ssrfSafeFetch`. O upstream passa `dispatcher` em cada chamada.
- **`libraries/nestjs-libraries/src/integrations/social/wordpress.provider.ts`** —
  `User-Agent` com a marca do fork (`RoboMultipost/1.0`, igual ao
  `credential.service.ts`), nao `Postiz/1.0`.
- **`apps/frontend/src/components/new-launch/providers/slack/slack.provider.tsx`** —
  a recusa de video e client-side (`checkValidity` com `t`), nao no
  `SocialAbstract.checkValidity` do upstream.

### Epico Temporal (2026-10-28) — divergencias deliberadas

- **`apps/backend/src/services/auth/auth.service.ts`** — o upstream (`1f5f24e5`)
  manda ativacao/reenvio/redefinicao de senha por `sendEmailSync` dentro da
  requisicao HTTP. O fork mantem `EmailService.sendEmail` (Temporal, fila
  `email`) com `lang`: SMTP bloqueado travaria o cadastro por minutos
  (timeouts padrao do nodemailer). Nao aceitar a troca nem a remocao do
  `NotificationService` do construtor.
- **`libraries/nestjs-libraries/src/temporal/temporal.module.ts`** — workers de
  e-mail entram em `buildTemporalWorkers` (funcao testavel do fork), nao no
  `TemporalModule.register` inline do upstream.
- **`libraries/nestjs-libraries/src/integrations/social.abstract.ts`** — o fork
  nao tem `mediaChunk`/`mediaSize` (leitura por faixas); o prazo do #2193 vive
  so no `readOrFetch`, que mantem `localMediaPath` e devolve `Buffer.from`.
  Mensagem do `BadBody` em pt-BR e caminho via `heartbeatEndpoint` (sem
  `stripQuery`).
- **`apps/orchestrator/src/workflows/send.email.workflow.ts`** — `lang` vai no
  payload do `sendSingleEmailWorkflow` e na activity; `sendEmailWorkflow`
  fica intacto enquanto houver `send_email` aberto.

## Regras Importantes

- NUNCA executar `git push --force` em nenhuma branch
- NUNCA commitar diretamente na branch `postiz`
- Sempre pedir confirmacao antes de resolver conflitos
- Se algo parecer errado, parar e perguntar ao usuario
- O build e opcional mas fortemente recomendado
- **Sempre reler a secao "Customizacoes Divergentes do Upstream" antes de
  aceitar qualquer resolucao de conflito nos arquivos listados.**
