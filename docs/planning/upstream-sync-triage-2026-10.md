# Triagem cirúrgica do upstream Postiz — outubro de 2026 (v2.24.0 → v2.25.2)

> Data da análise: 23/10/2026
> Branch de trabalho: `maiconramos/security`
> Base do fork (`main`): `b6686fe0` (v0.5.6, 09/09/2026)
> Espelho local (`postiz`): `db1a49e2` (02/09/2026)
> Releases do upstream desde o espelho: `v2.24.0` (22/09), `v2.25.0` (02/10), `v2.25.1` (11/10), `v2.25.2` (23/10)
> Cabeça de `upstream/main` analisada: `9383f5be` (24/10 — mesma da tag `v2.25.2`)

Processo igual ao de [junho](./upstream-sync-triage-2026-06.md) e
[agosto](./upstream-sync-triage-2026-08.md): cada PR e cada commit direto do
upstream foi confrontado com os arquivos que o fork modificou e recebeu um
veredito individual (apêndice no fim). A diferença desta rodada é que o
upstream publicou **quatro advisories de segurança** depois do nosso espelho e
que, no mesmo intervalo, saíram security releases do **Node.js** (21/10), do
**nginx** (14/10) e advisories em cinco dependências que o fork resolve
(`next`, `sharp`, `undici`, `multer`, `body-parser`). Segurança vem primeiro;
o restante vira backlog classificado.

## 1. Decisão executiva

**Não fazer merge integral de `postiz` em `main`.** Os números pioraram desde
agosto:

- `postiz..upstream/main`: 604 commits (365 sem merge), 171 PRs e 74 commits
  diretos na `main` do upstream;
- o fork tem **1.779 arquivos** modificados desde a base comum `e3b3b82f`;
- 107 das 129 entradas first-parent do upstream tocam arquivo divergente;
- os épicos do upstream (novo modal de criação com 98 arquivos, timezone por
  usuário com 51, clipping com 52, Mastra 1.67) se sobrepõem a perfis,
  tokens cifrados, MCP por perfil e pipeline Temporal V102/V112 do fork.

Trilhas desta rodada:

| Trilha | Conteúdo | Onde |
|---|---|---|
| **A. Segurança agora** | 4 advisories Postiz + hardening correlato + 4 achados do próprio fork + 5 dependências com advisories + Node 22.23.4 | esta branch, PR único em rascunho |
| **B. Infra** | nginx (imagem e proxy do host) | decisão do mantenedor — seção 3.11 |
| **C. Backlog de portes** | 25 `ADOPT`, 51 `PROVIDER`, 47 `REVIEW`, 8 `MCP`, 22 `P2`; 11 `ÉPICO` isolados; 71 `SKIP` | apêndice; PRs pequenos |

## 2. O que exatamente saiu no Postiz

| Release | Data | Advisory | Estado do fork antes desta branch |
|---|---|---|---|
| `v2.24.0` | 22/09 | **PSA-2026-TD98KY / CVE-2026-94456** (crítico 9.1): `Math.random()` em tokens OAuth, códigos, client secrets, API keys | parcialmente coberto desde junho (`makeSecureId` em `oauth.service`, apiKey de org/perfil); **residual** em `state`/`codeVerifier`/`nonce` de 34 providers, senha placeholder e nomes de upload |
| `v2.24.0` | 22/09 | **PSA-2026-P8W1J0 / CVE-2026-94455** (alto 7.1): `/enterprise/create-user` aceita qualquer JWT assinado | **vulnerável** (código idêntico ao upstream pré-fix) |
| `v2.25.1` | 11/10 | **PSA-2026-4QX1WG / CVE-2026-107761** (médio 5.3): apiKey em `GET /user/organizations`, tokens no delete de canal | **vulnerável** nos dois pontos |
| `v2.25.2` | 23/10 | **PSA-2026-JNXM56 / CVE-2026-115931** (crítico 9.9): `/integrations/function` executa qualquer método do provider → leitura arbitrária de arquivo / crash | **vulnerável** (afeta ≥ 2.23.0; nosso espelho é 2.23.0+) |

Hardening sem advisory no mesmo intervalo: `5f18f1ca` (SSRF/path de mídia),
`#2269` (open redirect no `returnUrl`), `#2166` (texto do post no log do
Telegram), `b0855956` (sharp 0.35.5), `5e62c628` (Node 22.23.4).

## 3. Prioridade P0 — segurança (portado nesta branch)

Formato: **Upstream** → **Problema** → **Estado do fork** → **Ação** →
**Teste**.

### 3.1. CVE-2026-115931 — método arbitrário via `POST /integrations/function`

- **Upstream:** `9383f5be` (v2.25.2).
- **Problema:** o controller fazia `integrationProvider[body.name](token, data, …)`
  para qualquer `name`. `SocialAbstract.readOrFetch(path)` faz `readFileSync`:
  um usuário com um canal cujo token é um caminho de arquivo lê qualquer
  arquivo do processo (incluindo o ambiente com `JWT_SECRET`, banco e Redis) e
  forja sessão de qualquer usuário. Outros helpers derrubam o processo.
- **Estado do fork:** vulnerável (`integrations.controller.ts`, rota
  `/function` e `/mentions` repassando `body.name`).
- **Ação (portada e ampliada):**
  - novo `integrations/dashboard.function.decorator.ts` (`@DashboardFunction()`)
    e `IntegrationManager.isDashboardCallable(provider, name)`: só `@Tool` ou
    métodos marcados; nomes não-string, propriedades que não são função e
    métodos herdados de `Object` são negados;
  - `/function` usa a allowlist; `/mentions` força `name: 'mention'`;
  - marcação nos 8 métodos que só o dashboard chama e que não são `@Tool`:
    `mention` (abstract), `pages` (facebook, instagram, youtube, gmb),
    `company` (linkedin), `companies` (linkedin-page), `tags` (hashnode).
    Todos os demais nomes usados pelo frontend (`subreddits`, `restrictions`,
    `channels`, `boards`, `publications`, `organizations`, `groups`, `label`,
    `experiences`, `list`, `templates`, `teams`, `postTypes`,
    `categoriesList`, `tagsList`) já são `@Tool`;
  - **achado do fork:** `/function` e `/mentions` não passavam por
    `validateIntegrationProfile` como as rotas irmãs (`/:id/time`, `/disable`,
    `/delete`); um `USER` restrito ao perfil A podia operar o token do canal do
    perfil B. Ambas as rotas agora validam o perfil.
- **Teste:** `integration.manager.spec.ts` — tabela com as 35 chamadas que o
  frontend faz (todas permitidas), herança do `mention` sobrescrito (x,
  discord, bluesky, linkedin, threads) e bloqueio de `readOrFetch`, `fetch`,
  `post`, `authenticate`, `constructor`, `toString`, `__proto__`, não-string.

### 3.2. CVE-2026-94455 — `/enterprise/*` aceita qualquer JWT da instância

- **Upstream:** `9259cf24` (v2.24.0).
- **Problema:** `EnterpriseController` fica fora do `AuthMiddleware` e só
  verifica a assinatura. Login, convite, reset de senha e token da extensão
  usam o mesmo `JWT_SECRET` sem claim de propósito; o token de login do
  próprio usuário cria uma org ULTIMATE vitalícia (SUPERADMIN, 1.000.000 de
  canais) e devolve a apiKey.
- **Estado do fork:** vulnerável. Mitigante: billing desabilitado por padrão
  (`DISABLE_BILLING=true`) reduz o ganho, mas a apiKey ainda sai.
- **Ação:** `services/enterprise.token.ts` (`verifyEnterpriseToken`) rejeita
  payloads com `providerName`, `orgId`, `timeLimit`, `expires`,
  `integrationId`, `billing`, `password`, `discount`, `order_id` (todos os
  formatos que o fork assina); `/create-user` exige `id` e `saasName`.
- **Teste:** `enterprise.token.spec.ts` assina tokens reais com
  `jsonwebtoken` e cobre cada formato.

### 3.3. CVE-2026-94456 — `Math.random()` em segredos (residual)

- **Upstream:** `4c835138` (v2.24.0).
- **Estado do fork:** os caminhos críticos (client secret/código/token OAuth,
  apiKey de org e de perfil) já usavam `makeSecureId` desde a auditoria de
  junho, e o fork **não tem** o endpoint de Dynamic Client Registration que
  dava a amostragem anônima do PRNG. Restavam `state`/`codeVerifier`/`nonce`
  OAuth em 34 providers (incluindo `zernio.base`, `kick`, `twitch`, `vk`,
  `whop`), o TikTok com `Math.random().toString(36)` reutilizado como
  `codeVerifier`, os PKCE `codeVerifier` de LinkedIn/LinkedIn Page/Reddit, a
  senha placeholder do usuário enterprise e os **nomes de arquivo do storage
  local** (`local.storage.ts`, único controle de acesso em `/uploads/*`).
- **Ação:** tudo acima em `makeSecureId`/`randomBytes`; comprimentos
  preservados (paridade com o upstream; `state` continua curto em alguns
  providers — brute force exige acertar uma chave Redis dentro do TTL).
- **Teste:** `oauth.state.entropy.spec.ts` (contrato: nenhum provider pode
  voltar a gerar `state`/`codeVerifier`/`nonce` com `makeId`/`Math.random`).

### 3.4. CVE-2026-107761 — segredos em respostas autenticadas

- **Upstream:** `8ad0df3d` (v2.25.1).
- **Problema/estado do fork:** `GET /user/organizations` devolvia a linha
  inteira da org (com `apiKey`) a qualquer membro; `deleteChannel` devolvia a
  linha do canal (token, refreshToken, `customInstanceDetails`) na API pública
  e no dashboard.
- **Ação:** controller mapeia `{ id, name, users, subscription }` (o seletor
  de org usa só `id`/`name`; `auth.middleware` continua recebendo a linha
  completa do service); `deleteChannel` com `select: { id: true }`.
  **Contrato público alterado:** `DELETE /public/v1/integrations/:id` devolve
  `{ id }`.
- **Teste:** `integration.repository.spec.ts` (`deleteChannel`).

### 3.5. SSRF e leitura de arquivo via `path` de mídia

- **Upstream:** `5f18f1ca` (19/10): (a) confina `path` de mídia em
  `UPLOAD_DIRECTORY`; (b) reescreve o validador de IP com `net.BlockList`.
- **Problema (a):** `PostsService.updateMedia` concatena
  `UPLOAD_DIRECTORY + path` com o `path` que vem do cliente (DTO do post **e**
  a tool MCP de agendamento, que passa strings cruas) e os providers leem
  caminhos locais do disco (`readOrFetch`, `createReadStream` no LinkedIn).
  `/../../etc/passwd` ou um caminho local contendo `http` (que pula o prefixo)
  viram leitura arbitrária de arquivo pelo worker.
- **Estado do fork:** vulnerável. O `plan-reviewer` apontou um **bloqueador**
  no porte literal: `updateMedia` tem um `try/catch` que devolve a lista
  **crua** em qualquer erro (`UPLOAD_DIRECTORY` ausente, `getMediaById` nulo,
  falha no download PNG do TikTok), então um filtro dentro do `try` seria
  contornável.
- **Ação:** `posts/media.path.guard.ts` (`isAllowedMediaPath`,
  `filterAllowedMedia`) roda **antes** do `try` e o `catch` devolve a lista
  filtrada; sem `UPLOAD_DIRECTORY` (storage remoto) nenhum caminho local é
  aceito. Itens rejeitados são descartados (mesmo comportamento do upstream).
  Bônus do reviewer: a conversão PNG→JPEG do TikTok baixava `m.url` com o
  **axios global** (sem DNS pinning, seguindo redirects); agora lê do disco
  quando o caminho é local (já confinado) e usa `getSsrfSafeAxios()` quando é
  remoto.
- **Não portado (b):** o validador do fork (`webhook.url.validator.ts`) **já
  bloqueia** IPv4-mapped, NAT64 (`64:ff9b::/96` e `64:ff9b:1::/48`), 6to4,
  Teredo, documentação, ULA, link-local e site-local — a reescrita do
  upstream não fecha lacuna nossa e afrouxaria os bloqueios em bloco de
  NAT64/6to4. Decisão: manter o nosso (coberto por
  `ssrf.safe.dispatcher.spec.ts`).
- **Teste:** `media.path.guard.spec.ts` (traversal, prefixo irmão, `http` no
  meio, sem `UPLOAD_DIRECTORY`, itens por `id`).

### 3.6. Open redirect / XSS no `returnUrl` pós-login

- **Upstream:** `9a889598` / `#2269` (v2.25.2).
- **Problema:** `return.url.component.tsx` guardava qualquer string contendo
  `http` e `layout.context.tsx` faz `window.location.href = valor` — além de
  redirecionar para fora, `javascript:...http` executa.
- **Ação:** só URL com a mesma origem e protocolo da página, validada na
  escrita e na leitura (`getAndClear`), porque o `localStorage` pode guardar
  um valor salvo antes da checagem.

### 3.7. Higiene de log — Telegram

- **Upstream:** `#2166` (v2.25.0). Removidos `console.log(text)` (conteúdo do
  post) e `console.log(JSON.stringify(chat))` em `telegram.provider.ts`.

### 3.8. Achados do próprio fork durante a triagem (sem equivalente upstream)

1. **Oráculo de assinatura em `POST /integrations/social/extension-refresh`**
   (`no.auth.integrations.controller.ts`): o JSON de cookies enviado pelo
   cliente era **assinado com `JWT_SECRET`** e gravado em
   `customInstanceDetails`. Quem conecta um canal via extensão (Skool) podia
   incluir chaves arbitrárias (`id` de outro usuário, `saasName`, `billing`) e
   recuperar o token pelo eco do delete de canal — forja de sessão
   (`auth.middleware` aceita qualquer JWT com `id`), de token enterprise e de
   billing. Agora só os cookies declarados em `extensionCookies` são gravados,
   cifrados em AES (formato que `SkoolProvider.getCookies` já lê primeiro; o
   legado JWT continua sendo lido).
2. **Spread do body no JWT de convite** (`inviteTeamMember`): `{ ...body, orgId,
   timeLimit, id }` com `ValidationPipe` sem `whitelist` deixava um admin
   carimbar `billing: 'ULTIMATE'` e usar o link em
   `POST /public/modify-subscription` (não autenticado, aceita `{orgId,
   billing}`). O payload agora é uma whitelist
   (`email`, `role`, `profileIds`, `profileRole`, `orgId`, `timeLimit`, `id`).
3. **`/integrations/function` e `/mentions` sem `validateIntegrationProfile`**
   — ver 3.1. O mesmo valia para `PUT /integrations/:id/group` e
   `PUT /integrations/:id/customer-name`, corrigidas junto.
4. **Nomes de upload com `Math.random`** — ver 3.3. Também as chaves de objeto
   do R2 (`cloudflare.storage.ts`, `r2.uploader.ts`), o `state` do refresh do
   VK e o id `track` devolvido sem autenticação por `/public/track` (oráculo do
   PRNG: 10 saídas consecutivas por chamada).
5. **`POST /third-party/function/:id/:functionName`** executava qualquer método
   da instância do provider (HeyGen, ReelFarm) pelo nome vindo da URL, com a
   API key decifrada como primeiro argumento — mesma classe do CVE-2026-115931.
   Allowlist: só métodos declarados na própria classe do provider
   (`isThirdPartyFunctionCallable`).
6. **`GET /user/profiles` expunha `apiKey`/`zernioApiKey`/`lateApiKey` de cada
   perfil a qualquer membro** (inclusive Visualizador); a chave por perfil dá
   escrita em `/public/v1`. `getAccessibleProfiles` remove os campos.
7. **Mais três rotas ecoavam a linha inteira do canal** (`/:id/group`,
   `/:id/customer-name`, `/:id/nickname`): `select` explícito nos updates.
8. **Logs e comparação:** corpo completo do post logado na API pública,
   JWT portador logado no callback cripto, comparação `!==` da `AGENT_API_KEY`
   (agora `timingSafeEqual`); conexão inicial via extensão cifrava o JSON
   inteiro do cliente (agora a mesma whitelist do `extension-refresh`).
9. **`catch` de `updateMedia`** (apontado pelo `security-auditor`): a lista
   filtrada tinha paths **sem o prefixo** de `UPLOAD_DIRECTORY`; um
   `/etc/passwd` passa no guard como relativo e chegaria cru ao provider. O
   `catch` agora devolve só itens com `path` string, já prefixados.

### 3.9. Dependências com advisories (GitHub Advisory Database, 23/10)

| Pacote | Resolvido antes | Advisories que atingem a versão | Ação |
|---|---|---|---|
| `next` | 16.3.1 | **2 críticos** (RCE não autenticado no Image Optimization com SVG — mitigação exige `sharp` ≥ 0.35.5; RCE em `use cache` com typed arrays — não usamos `use cache`), 1 alto (DoS em Server Actions), 2 médios | `16.4.1` (dep + `pnpm.overrides`) |
| `sharp` | 0.33.5 | 3 altos (libvips CVE-2026-33327/33328/35590/35591; libheif; librsvg CVE-2026-96889) | `^0.35.5` |
| `undici` | 7.27.2 | 1 alto (DoS por `content-encoding` excessivo), 3 médios | `^7.30.1` (é o transporte de **todo** o `ssrfSafeFetch`) |
| `multer` | 2.3.0 | 1 alto novo (23/10) + 1 médio | override `^2.5.0` |
| `body-parser` | 2.2.2 (Express 5) e 1.20.4 (Express 4 via `@copilotkit/runtime`/`@a2a-js/sdk`) | 1 alto: **crash do processo** com um único request comprimido com bytes extras, antes do roteamento/autenticação | overrides `^2.4.0` e `^1.20.9` |
| `axios` | 1.20.0 | — (já acima de 1.20.0) | nada |

Fora desta rodada: pin do Sentry SDK 10.56.0 (`#2101`, leak de span/scope —
chore, não segurança) e o upgrade Mastra/CopilotKit (épico IA).

### 3.10. Node.js — security release de 21/10/2026

Versões corrigidas: v22.23.4 / v24.22.1 / v26.12.1. Para a linha 22.x:

| CVE | Severidade | O que é | Exposição do fork |
|---|---|---|---|
| CVE-2026-111497 | alta (9.2 na NVD) | out-of-bounds write no decoder Brotli (`node:zlib`) → crash, vazamento de memória ou RCE | **pré-autenticação**: o `body-parser` 2.x do Express 5 descomprime `Content-Encoding: br` em todo POST antes do roteamento; `fetch`/undici também descomprime respostas `br` de URLs que o usuário fornece |
| CVE-2026-105482 | alta | `dns.resolve*()` trunca o hostname em NUL | o validador SSRF usa `dns.lookup` (não afetado pela mesma rota), mas a correção fecha a classe |
| CVE-2026-106069 / 106072 | alta / média | verificação de hostname TLS com IPv4 em notação não canônica | chamadas HTTPS a providers |
| CVE-2026-105481 | média | socket keep-alive aceita resposta não solicitada | HTTP Agent |
| CVE-2026-106073 / 106074 | baixa / média | permission model; entropia em snapshots | não aplicável |

Estado: `Dockerfile.dev` usava a tag flutuante `node:22.23-bookworm-slim`, que
no Docker Hub **já aponta** para `22.23.4` (mesmo digest `de170b39…` desde
21/10) — qualquer rebuild pegaria a correção. Fixamos o patch
(`node:22.23.4-bookworm-slim`), `engines` `>=22.23.4 <23.0.0`, `volta` e a
matriz do `build.yml` para reprodutibilidade e para o dev local acusar versão
antiga (o Node do dev estava em 22.22.3). **A imagem publicada `0.5.6`
(build de 09/09) roda Node 22.23.2 e continua exposta até uma nova tag `v*`
ser construída e implantada** — o merge deste PR não muda nada em runtime.

### 3.11. nginx — out-of-band F5 de 14/10/2026 (5 CVEs)

O container instala nginx pelo apt do Debian bookworm (`1.22.1-9+deb12u9`,
`deb12u10` em bookworm-security). Status no Debian Security Tracker em
23/10: os cinco CVEs estão **"vulnerable" para bookworm, sem DSA**; trixie foi
corrigido em `1.26.3-3+deb13u10` (DSA-6575-1); sid em `1.30.6-2`.

| CVE | Condição para ser vulnerável (F5/nginx.org) | `var/docker/nginx.conf` |
|---|---|---|
| CVE-2026-15176 (heap overflow, "alias with rewrite") | `alias` **junto com** `rewrite` e `set`/`return` referenciando `$request_filename`, ou `$request_filename` no `log_format` | temos `alias /uploads/` **sem** `rewrite`, sem `$request_filename` e `log_format` padrão → não exposto |
| CVE-2026-93479 (heap overflow em script evaluation) | `map` com regex + `root`/`log_format` usando as capturas; nginx.org lista só 1.30.0–1.31.6 | sem `map` → não exposto (e 1.22 fora do range) |
| CVE-2026-97205 (UAF, AIO + SSI) | `aio on` + SSI `include virtual` | sem AIO nem SSI → não exposto |
| CVE-2026-95101 (HTTP/3 request body injection) | `listen … quic`; 1.25.0–1.31.6 | sem HTTP/3; 1.22 fora do range |
| CVE-2026-97629 (forja de sessão TLS) | `ssl_session_cache` sem `ssl_session_ticket_key` explícito; pode pular `ssl_verify_client` | o nginx do container não termina TLS → não exposto **no container** |

Os 21 CVEs de 2026 anteriores do nginx já estão resolvidos no Debian
(`deb12u10`): um rebuild da imagem os incorpora automaticamente.

**Decisão pendente do mantenedor (trilha B):**

1. **Imagem:** (a) manter bookworm e aguardar DSA (nenhum caminho vulnerável
   em uso — risco residual baixo); (b) trocar a base para
   `node:22.23.4-trixie-slim` (nginx 1.26.3 já corrigido; exige um
   `docker build` local de validação porque muda glibc/python/gcc do
   toolchain nativo); (c) instalar nginx do repositório oficial nginx.org
   (1.30.6) sobre bookworm. **Decisão do mantenedor (23/10): (b)** — a
   branch passou para `node:22.23.4-trixie-slim`; a validação da imagem
   fica a cargo do build de release (`build-containers.yml`).
2. **Proxy do host (VPS):** o `docker-compose.yaml` não tem serviço de proxy —
   o TLS termina **fora** do repositório. É esse nginx que fica exposto a
   CVE-2026-97629 (se usar `ssl_session_cache` + `ssl_verify_client`) e aos
   demais conforme a configuração. Precisa de inventário: versão (`nginx -v`),
   `nginx -T | grep -E 'alias|rewrite|request_filename|map|aio|ssi|quic|ssl_session'`
   e atualização para ≥ 1.30.6 / 1.28.x corrigido ou pacote da distro com
   fix.

## 4. Não portado deliberadamente (upstream)

- `5f18f1ca` parte (b) — `net.BlockList` no validador SSRF: coberto (ver 3.5).
- `#2095` Range no servidor local de uploads: o fork já entregou Range estrito
  na v0.5.6.
- `#2013` workflow v1.1.2: já existe no fork (V112 opt-in).
- `#2200` ocultar aba Equipe para `USER`: a aba do fork já é adaptável por
  papel; conferir apenas o caso org-USER sem perfil.
- `#2079` comentários anônimos no preview + reCAPTCHA: nova superfície pública
  de escrita; o fork tem revisão/aprovação própria — reavaliar como produto.
- `#2091`, DCR, ChatGPT app, conector self-hosted, HubSpot, Canva: superfícies
  de Postiz Cloud; o DCR é exatamente a amostragem anônima do CVE-2026-94456.
- `b958c5d5` cookies `invite`/`showorg` com vida maior: UX, não segurança —
  `REVIEW` (proxy.ts divergente).

## 5. Backlog classificado (próximos PRs)

- **`ADOPT` (25)** — cherry-pick ou porte de poucas linhas: remoção do
  PostHog (`3dc18da9`; o fork ainda carrega `helpers/posthog.tsx`), fonte
  Plus Jakarta Sans self-hosted (`#2266`), sanitizer com block tags → `<p>` e
  regex linear (`#2289`, `2ded21d1`), Reddit `r/name` (`#2116`), Slack
  (`#2117`, `#2118`), Hashnode endpoint vivo (`#2108`), Nostr chave hex
  (`#2141`), guards da extensão (`#2143`, `#2148`), `deletePost` devolve id
  (`#2247`), pin Sentry (`#2101`), e os de zero sobreposição listados no
  apêndice. Lembrete do agosto: "zero sobreposição" é heurística — validar
  com `git cherry-pick` e rodar `test:libs` + build.
- **`PROVIDER` (51)** — lote por provider, portando mapeamentos de erro
  linha a linha e conferindo as auditorias de setembro (Meta v25, Pinterest,
  LinkedIn, GMB, YouTube/TikTok, X) para não duplicar: Instagram (11 PRs),
  Facebook (10), TikTok (7), Pinterest (5), X (3), VK (3), Threads (3),
  Bluesky (2), Reddit (2), YouTube (4), Lemmy, Dribbble, WordPress, GMB,
  Moltbook, Farcaster/Neynar (reescrita).
- **`REVIEW` (47)** — arquivo divergente, porte manual: refresh token na
  reconexão (`#1884`, `#2298`, `#1678`), uploader/modal (`#2145`–`#2178`),
  find-slot (`#2207`), erros curados no calendário/API/MCP (`#2119`),
  `3f848ccb` (**remove `--accept-data-loss` do `prisma-db-push`**; nosso
  `CMD` roda db push no boot — decidir política antes), Sentry client
  (`#2082`–`#2284`; o fork só tem config server/edge — verificar se aplica),
  commits diretos sem PR (`4e55a959`, `96b78476`, `d883bfa1`, `7113c6ce`…).
- **`MCP` (8)** — `mediaListTool`/`mediaStatusTool`/`deletePostTool`
  (`#1926`), attachments `{path, alt, thumbnail}` (`#2175`), `previewUrl`
  (`8c63e686`), `destructiveHint` (`6b102afb`): portar preservando
  `auth.context`/`profileId`.
- **`P2` (22)** — features de produto com i18n pt-BR: renomear grupo/canal,
  filtro de canais, moldura de publicado, RTL, open-post link, thumbnails e
  alt text no painel, agendamento por grupo, imagem inline no editor,
  `client_secret_basic`/token 200.
- **`ÉPICO` (11)** — não diluir: Temporal (`#2193`, `#2087`, `#2258`,
  `185044d5`, `1f5f24e5`), novo modal de criação, timezone por usuário,
  Mastra/CopilotKit.
- **`SKIP` (71)** — billing/Stripe, clipping/RunPod/Deepgram, admin SaaS,
  HubSpot, DCR/ChatGPT, docs/README/CLAUDE.md do upstream (a regra de
  `#2191` sobre campos sensíveis em respostas virou pitfall nosso), streak,
  onboarding (decisão de 03/09 mantida).

## 6. Follow-ups de segurança do fork (fora desta rodada)

1. **JWT sem expiração nem propósito** (`SECURITY_AUDIT.md` B3/B9):
   `auth.middleware` aceita qualquer JWT com `id` como sessão — um token de
   reset de senha vira cookie de sessão eterno. A correção certa é claim de
   propósito + `exp` + `algorithms: ['HS256']` em todos os emissores, com
   rotação suave; é PR de segurança próprio, não cabe aqui.
2. O container roda como root (o advisory PSA-2026-JNXM56 cita isso como
   ampliador de impacto): avaliar `USER` não privilegiado no `Dockerfile.dev`
   quando migrar a base (trilha B).
3. `libraries/helpers/src/utils/read.or.fetch.ts` é um `readFileSync` sem
   importadores — remover.
4. Sentry no frontend: não há `instrumentation-client.ts`/replay; confirmar
   se o Sentry client está desligado de propósito antes de portar `#2280`.
5. **Linhas legadas de `customInstanceDetails`** (Skool): antes desta branch o
   `extension-refresh` assinava JSON do cliente; qualquer linha gravada por um
   usuário mal-intencionado continua sendo um JWT válido (sem expiração).
   Operação recomendada: listar integrações `skool` cujo
   `customInstanceDetails` começa com `eyJ` (JWT) e pedir reconexão; rotacionar
   `JWT_SECRET` invalidaria tudo, mas também quebra o que foi cifrado com
   `fixedEncryption` (chave derivada do mesmo segredo). **Resolvido em código
   (23/10):** `StartupMigrationService.migrateSkoolExtensionCookies` converte
   as linhas no boot e loga `warn` com as claims extras encontradas — após o
   deploy, procurar `carried unexpected claims in legacy JWT cookies` no log
   do backend; se aparecer, tratar como incidente (o token exfiltrado continua
   válido até rotacionar `JWT_SECRET`).
6. Confinamento de `path` de mídia é lexical (`resolve` + prefixo); a rota
   `/uploads` usa `realpath`. Reutilizar `safe.upload.path.ts` se algum dia
   `UPLOAD_DIRECTORY` contiver symlinks criados fora do app.
7. `verifyEnterpriseToken` é uma denylist de formatos conhecidos; a correção
   definitiva é claim de propósito (`aud`/`purpose`) em todos os emissores —
   junto com o item 1.
8. NOWPayments (`/public/crypto/:path`): `processPayment` confia no
   `order_id` do corpo e não verifica assinatura IPN. Billing está desabilitado
   no fork; se algum dia for ligado, exige correção antes.
9. Dependabot ainda lista alertas pré-existentes fora desta rodada (críticos:
   `handlebars` < 4.7.10, `piscina`, `proxy-addr`, `shell-quote`, `tar`,
   `vitest`; altos: `nodemailer`, `@modelcontextprotocol/sdk`, `compression`,
   `ws`, `hono`, `js-yaml`, `svgo`, `image-size`, `protobufjs`, `form-data`,
   `@nestjs/microservices`, `follow-redirects`, `markdown-it`, `lodash`…).
   Vale um PR de dependências próprio, com validação como a de setembro.
10. `Dockerfile.dev` fixa tag, não digest; container roda como root.

## 7. Execução (23/10/2026)

Implementado nesta branch (`maiconramos/security`), com `plan-reviewer`
antes do código e `code-reviewer` + `security-auditor` depois:

- 3.1 a 3.8 conforme descrito; specs novas: `enterprise.token.spec.ts`,
  `media.path.guard.spec.ts`, `oauth.state.entropy.spec.ts`; specs
  estendidas: `integration.manager.spec.ts`, `integration.repository.spec.ts`,
  `organization.service.spec.ts`.
- 3.9: `package.json` + lockfile (`next` 16.4.1, `sharp` ^0.35.5, `undici`
  ^7.30.1, overrides `multer` ^2.5.0, `body-parser` ^2.4.0/^1.20.9).
- 3.10: `Dockerfile.dev`, `engines`, `volta`, `build.yml`, `dependabot.yml`,
  `docs/operations/docker-release.md`, `docs/development/validacao-dev.md`.
- 3.11: só documentação; decisão de imagem/proxy fica com o mantenedor.
- Documentação: `CLAUDE.md` de backend, nestjs-libraries e social
  (`@DashboardFunction`, propósito de JWT, `makeSecureId`, `media.path.guard`),
  `CHANGELOG.md`.

Validação local (23/10/2026, Node 22.22.3 no dev — por isso o `pnpm` avisa
`Unsupported engine` após o pin):

| Gate | Resultado |
|---|---|
| `pnpm build:backend` / `build:orchestrator` / `build:frontend` (Next 16.4.1) | exit 0 nos três |
| Jest `nestjs-libraries` + `backend` (suíte completa) | 127 suites, 1.226 testes, 0 falhas |
| Jest `orchestrator` (inclui replay que compila o bundle real de workflows) | 4 suites, 21 testes, 0 falhas |
| `eslint` | **não validado**: ESLint 8.57 + `eslint.config.mjs` falha com `Converting circular structure to JSON` antes de analisar qualquer arquivo — dívida de tooling pré-existente (anotada em junho) |
| Revisões | `plan-reviewer` (1 bloqueador: filtro de mídia dentro do `try` — corrigido antes de codar), `code-reviewer` (3 MUST FIX: specs de `updateMedia`, `createMaxUser` e controllers — adicionados; nome da branch mantido por ser a worktree do mantenedor), `security-auditor` (0 crítico, 4 HIGH — todos tratados na 2ª rodada, 8 MEDIUM — 6 tratados, 2 registrados na seção 6), `doc-maintainer` (E1–E13 aplicados) |

O espelho local `postiz` foi avançado para `9383f5be`; o push do espelho fica
para o mantenedor (cada push em branch dispara `build.yml`, ~8 min).

## Apêndice — classificação 1 por 1 (171 PRs + 74 commits diretos)

Legenda: **P0** segurança (nesta branch) · **ADOPT** cherry-pick/porte leve ·
**COBERTO** já existe no fork · **REVIEW** arquivo divergente, porte manual ·
**PROVIDER** lote por provider · **MCP** lote de tools/IA · **P2** feature de
produto a avaliar · **ÉPICO** isolado · **SKIP** não agrega ao self-hosted.
`Arq.` = arquivos tocados; `Diverg.` = quantos desses o fork também modificou
desde `e3b3b82f`. Merges `origin/main` do first-parent foram omitidos
(agregam PRs já listados).

| Tipo | PR | sha | Data | Assunto | Arq. | Diverg. | Veredito | Motivo |
|---|---|---|---|---|---:|---:|---|---|
| direto | — | `4c835138` | 2026-09-22 | fix: CVE-2026-94456 | 39 | 28 | **P0** | CVE-2026-94456: residual — state/codeVerifier OAuth e senha placeholder ainda em makeId |
| direto | — | `9259cf24` | 2026-09-22 | fix: CVE-2026-94455 | 1 | 0 | **P0** | CVE-2026-94455: /enterprise aceita qualquer JWT assinado (fork vulnerável) |
| PR | #2166 | `235e7daf` | 2026-09-29 | fix(telegram): stop logging the post text on publish | 1 | 0 | **P0** | texto do post logado no Telegram (higiene de log) |
| PR | #2269 | `adb8a1a7` | 2026-10-15 | fix(auth): only follow a returnUrl on this app after signing in | 1 | 0 | **P0** | open redirect no returnUrl após login |
| direto | — | `5f18f1ca` | 2026-10-19 | feat: ssrf fixes | 2 | 2 | **P0** | SSRF/path: confinar path de mídia em UPLOAD_DIRECTORY + BlockList IPv4-mapped/NAT64/6to4 |
| direto | — | `5e62c628` | 2026-10-22 | feat: latest node version | 1 | 1 | **P0** | Node 22.23.4 (security release 21/10: Brotli RCE etc.) |
| direto | — | `b0855956` | 2026-10-23 | fix(deps): bump sharp to 0.35.5 | 2 | 2 | **P0** | sharp 0.35.5: 3 advisories high (libvips/libheif/librsvg) + workaround do RCE do Next |
| direto | — | `9383f5be` | 2026-10-24 | fix(integrations): only run allowed provider methods from /integrations/function | 12 | 9 | **P0** | CVE-2026-115931: allowlist de métodos em /integrations/function (fork vulnerável) |
| PR | #1915 | `79963b54` | 2026-09-15 | fix: reddit settings type only accepts self, link, media | 2 | 0 | **ADOPT** | zero/baixa sobreposição; cherry-pick ou porte de poucas linhas |
| PR | #2085 | `7f681d49` | 2026-09-16 | fix(frontend): reconnect click on a custom-fields channel opened a 404 page | 1 | 1 | **ADOPT** | reconectar canal custom-fields abria 404 |
| PR | #2094 | `6a733760` | 2026-09-17 | fix(customer-modal): replace Mantine Autocomplete with native input (React 19 ref warning) | 1 | 0 | **ADOPT** | zero/baixa sobreposição; cherry-pick ou porte de poucas linhas |
| PR | #2108 | `e3c9f1fa` | 2026-09-21 | fix(hashnode): move to the live GraphQL endpoint and current publishPost schema | 1 | 0 | **ADOPT** | zero/baixa sobreposição; cherry-pick ou porte de poucas linhas |
| PR | #2118 | `6577ad87` | 2026-09-22 | fix(slack): reject video attachments at save time | 1 | 0 | **ADOPT** | zero/baixa sobreposição; cherry-pick ou porte de poucas linhas |
| PR | #2117 | `04e60c8b` | 2026-09-22 | fix(slack): surface chat.postMessage failures instead of marking the post published | 1 | 0 | **ADOPT** | zero/baixa sobreposição; cherry-pick ou porte de poucas linhas |
| PR | #2116 | `e62ef360` | 2026-09-22 | feat(reddit): resolve a pasted r/name or subreddit URL in the subreddit search | 1 | 1 | **ADOPT** | reddit: resolve r/name ou URL na busca de subreddit |
| PR | #2153 | `374fb202` | 2026-09-25 | fix(auth): don't read the activate response body once the onboarding redirect started | 1 | 1 | **ADOPT** | ativação: não lê body após redirect do onboarding |
| PR | #2148 | `38443af9` | 2026-09-25 | fix(frontend): guard the chrome global before the extension connect check | 1 | 1 | **ADOPT** | guards da extensão Chrome (chrome global / runtime.lastError) |
| PR | #2143 | `a59aa389` | 2026-09-25 | fix(frontend): silence Unchecked runtime.lastError from extension messaging callbacks | 2 | 2 | **ADOPT** | guards da extensão Chrome (chrome global / runtime.lastError) |
| PR | #2141 | `b1725798` | 2026-09-25 | fix(nostr): convert the hex private key to bytes before signing posts | 1 | 0 | **ADOPT** | zero/baixa sobreposição; cherry-pick ou porte de poucas linhas |
| PR | #2140 | `723f2308` | 2026-09-25 | fix(telegram): map Telegram 400 rejections to non-retryable BadBody errors | 1 | 0 | **ADOPT** | zero/baixa sobreposição; cherry-pick ou porte de poucas linhas |
| PR | #2164 | `528f6ea3` | 2026-09-28 | fix(frontend): remove duplicate 'use client' directive in VK provider | 1 | 0 | **ADOPT** | zero/baixa sobreposição; cherry-pick ou porte de poucas linhas |
| PR | #2177 | `6eceb7e8` | 2026-09-29 | fix(media): fail the upload step when the backend returns an error | 1 | 0 | **ADOPT** | zero/baixa sobreposição; cherry-pick ou porte de poucas linhas |
| PR | #2101 | `9c4524e1` | 2026-09-30 | chore(deps): pin the Sentry SDK to 10.56.0 to fix the span/scope memory leak | 2 | 2 | **ADOPT** | pin Sentry SDK (leak de span/scope) — entra no PR de deps |
| direto | — | `6b102afb` | 2026-10-02 | feat: destructiveHint | 2 | 0 | **ADOPT** | destructiveHint nas tools MCP (0 sobreposição) |
| PR | #2217 | `24b77c24` | 2026-10-07 | fix(frontend): honor the AM/PM date metric in the post date picker time input | 1 | 0 | **ADOPT** | zero/baixa sobreposição; cherry-pick ou porte de poucas linhas |
| PR | #2225 | `bc61335b` | 2026-10-09 | fix(integrations): log the error behind "Authentication failed" on social connect | 1 | 1 | **ADOPT** | loga a causa do "Authentication failed" no connect social |
| PR | #2248 | `d5615020` | 2026-10-14 | fix(editor): make the mention dropdown readable in dark mode | 1 | 0 | **ADOPT** | zero/baixa sobreposição; cherry-pick ou porte de poucas linhas |
| PR | #2247 | `6e8ef482` | 2026-10-14 | fix(posts): return the deleted post id from public API deletes | 1 | 1 | **ADOPT** | public API delete devolve id do post |
| PR | #2266 | `021c2ee0` | 2026-10-15 | fix(frontend): self-host Plus Jakarta Sans instead of next/font/google | 8 | 2 | **ADOPT** | fonte self-hosted (sem Google Fonts no build/runtime) |
| PR | #2262 | `05e8efb9` | 2026-10-15 | fix(telegram): mark connect command input as read-only | 1 | 0 | **ADOPT** | zero/baixa sobreposição; cherry-pick ou porte de poucas linhas |
| direto | — | `3dc18da9` | 2026-10-19 | feat: remove posthog | 5 | 3 | **ADOPT** | remove PostHog (fork ainda carrega helper/posthog.tsx) |
| PR | #2290 | `ff6c1168` | 2026-10-20 | fix(preview): keep blank lines in the public post preview | 1 | 0 | **ADOPT** | zero/baixa sobreposição; cherry-pick ou porte de poucas linhas |
| PR | #2289 | `21956fa8` | 2026-10-20 | fix(posts): turn unsupported block tags into paragraphs when sanitizing content | 1 | 1 | **ADOPT** | sanitizer: block tags viram <p> + regex linear (mesmo arquivo do fork) |
| PR | #2013 | `36d5fc7b` | 2026-09-03 | feat(orchestrator): post workflow v1.1.2 retries on heartbeat timeout with no heartbeat de | 4 | 4 | **COBERTO** | post.workflow.v1.1.2 já existe no fork (V112 opt-in) |
| PR | #2095 | `23181536` | 2026-09-28 | fix(uploads): honor HTTP Range requests so local-storage video uploads work again | 1 | 1 | **COBERTO** | Range estrito no servidor local de uploads já entrou na v0.5.6 |
| PR | #2200 | `94a88919` | 2026-10-05 | fix(settings): hide the Teams tab from the User role | 18 | 4 | **COBERTO** | aba Equipe do fork já é adaptável por papel; conferir só o caso org-USER |
| PR | #2080 | `9b06ea22` | 2026-09-15 | fix(farcaster): show the approval QR in a modal instead of a blank tab | 20 | 4 | **REVIEW** | Farcaster → Neynar managed signers (reescreve provider + env) |
| PR | #2078 | `6dbaadb1` | 2026-09-15 | feat(farcaster): migrate from SIWN to Neynar managed signers, fix login state | 28 | 9 | **REVIEW** | Farcaster → Neynar managed signers (reescreve provider + env) |
| PR | #2083 | `43cd3d5b` | 2026-09-16 | fix(media): open the Change Bot Picture media picker as a modal | 1 | 1 | **REVIEW** | toca arquivo divergente — porte manual |
| PR | #2082 | `c182d166` | 2026-09-16 | fix(sentry): sample traces and session replays to stay under quota | 3 | 0 | **REVIEW** | config Sentry client: fork só tem server/edge config — verificar se aplica |
| direto | — | `1251b5a0` | 2026-09-18 | feat: hovering and copy | 2 | 1 | **REVIEW** | UI upstream (responsivo/menu/settings/notificações) em componentes que o fork reescreveu |
| direto | — | `c6bfe135` | 2026-09-18 | feat: images preview | 1 | 0 | **REVIEW** | UI upstream (responsivo/menu/settings/notificações) em componentes que o fork reescreveu |
| PR | #2100 | `30be46ee` | 2026-09-21 | fix(sentry): stop tracing GET requests to the MCP streamable routes | 1 | 0 | **REVIEW** | config Sentry client: fork só tem server/edge config — verificar se aplica |
| direto | — | `dcb5b09e` | 2026-09-22 | fix: allow mov | 1 | 0 | **REVIEW** | commit direto sem PR: inspecionar diff antes de decidir |
| PR | #2122 | `ba1f85b5` | 2026-09-23 | fix(frontend): stop the Sentry report dialog on the posthog-js recorder error | 1 | 0 | **REVIEW** | config Sentry client: fork só tem server/edge config — verificar se aplica |
| PR | #1827 | `ae1b80f3` | 2026-09-23 | fix(tags): clean up post assignments on tag deletion and stop matching soft-deleted tags | 1 | 1 | **REVIEW** | toca arquivo divergente — porte manual |
| PR | #2149 | `85a9f3cf` | 2026-09-25 | fix(media): cancel in-flight uploads on error instead of clearing Uppy state | 1 | 1 | **REVIEW** | toca arquivo divergente — porte manual |
| PR | #2146 | `b3535360` | 2026-09-25 | fix(calendar): handle a deleted post group when opening a calendar tile | 2 | 2 | **REVIEW** | toca arquivo divergente — porte manual |
| PR | #2145 | `055dbb89` | 2026-09-25 | fix(media): skip the upload-success state update for an already removed file | 1 | 1 | **REVIEW** | toca arquivo divergente — porte manual |
| PR | #2147 | `6e2f50e0` | 2026-09-25 | fix(frontend): stop the Sentry report dialog on the uppy aws-s3 progress error | 1 | 0 | **REVIEW** | config Sentry client: fork só tem server/edge config — verificar se aplica |
| PR | #2142 | `f7ae41bc` | 2026-09-25 | fix(frontend): stop the Sentry report dialog on MetaMask injected-script errors | 1 | 0 | **REVIEW** | config Sentry client: fork só tem server/edge config — verificar se aplica |
| PR | #2163 | `4db23eba` | 2026-09-28 | fix(media): keep the rest of the upload batch when one file fails | 17 | 3 | **REVIEW** | toca arquivo divergente — porte manual |
| PR | #2162 | `935e0694` | 2026-09-28 | fix(frontend): stop the Sentry report dialog on the Chrome wording of the uppy progress er | 1 | 0 | **REVIEW** | config Sentry client: fork só tem server/edge config — verificar se aplica |
| PR | #2161 | `f0f23f43` | 2026-09-28 | fix(frontend): don't report a failed post save as successful | 17 | 3 | **REVIEW** | toca arquivo divergente — porte manual |
| direto | — | `7229c338` | 2026-09-28 | feat: schema fix | 2 | 2 | **REVIEW** | commit direto sem PR: inspecionar diff antes de decidir |
| PR | #2178 | `9efa1f55` | 2026-09-29 | fix(frontend): close the edit modal instead of crashing when the post's channel is not loa | 1 | 1 | **REVIEW** | toca arquivo divergente — porte manual |
| PR | #2102 | `d739d084` | 2026-09-29 | fix(frontend): report React render crashes to Sentry from the crash screen | 1 | 0 | **REVIEW** | config Sentry client: fork só tem server/edge config — verificar se aplica |
| PR | #2171 | `852acdea` | 2026-09-29 | fix(editor): stop wiping in-flight uploads when an earlier upload finishes | 1 | 1 | **REVIEW** | toca arquivo divergente — porte manual |
| PR | #1678 | `ff561b2c` | 2026-09-30 | fix(integrations): send a single notification when a token refresh fails | 1 | 1 | **REVIEW** | refresh token/reconexão: fork tem reconexão Meta própria — portar linha a linha |
| direto | — | `852ac517` | 2026-09-30 | feat: more info | 3 | 2 | **REVIEW** | commit direto sem PR: inspecionar diff antes de decidir |
| direto | — | `9fedac40` | 2026-10-02 | feat: responsive | 30 | 22 | **REVIEW** | UI upstream (responsivo/menu/settings/notificações) em componentes que o fork reescreveu |
| direto | — | `4e55a959` | 2026-10-04 | feat: provider increase | 10 | 8 | **REVIEW** | commit direto sem PR: inspecionar diff antes de decidir |
| direto | — | `96b78476` | 2026-10-04 | fixes: analytics | 7 | 6 | **REVIEW** | commit direto sem PR: inspecionar diff antes de decidir |
| direto | — | `d883bfa1` | 2026-10-04 | feat: fix auto post | 2 | 2 | **REVIEW** | commit direto sem PR: inspecionar diff antes de decidir |
| direto | — | `c9138d35` | 2026-10-04 | feat: fix agent media sso | 1 | 1 | **REVIEW** | commit direto sem PR: inspecionar diff antes de decidir |
| PR | #2165 | `b3b074a5` | 2026-10-05 | fix(frontend): skip the Sentry report dialog for errors from browser extensions | 1 | 0 | **REVIEW** | config Sentry client: fork só tem server/edge config — verificar se aplica |
| PR | #2207 | `1e57cd33` | 2026-10-06 | fix(posts): find-slot never responds when all channels are disabled | 1 | 1 | **REVIEW** | toca arquivo divergente — porte manual |
| direto | — | `e756fa57` | 2026-10-07 | fix: responsive | 23 | 5 | **REVIEW** | UI upstream (responsivo/menu/settings/notificações) em componentes que o fork reescreveu |
| direto | — | `5ac6e10f` | 2026-10-08 | feat: fix icon | 23 | 6 | **REVIEW** | UI upstream (responsivo/menu/settings/notificações) em componentes que o fork reescreveu |
| direto | — | `7b29d401` | 2026-10-08 | feat: move menu items | 30 | 11 | **REVIEW** | UI upstream (responsivo/menu/settings/notificações) em componentes que o fork reescreveu |
| direto | — | `003a77eb` | 2026-10-08 | feat: fix settings | 18 | 4 | **REVIEW** | UI upstream (responsivo/menu/settings/notificações) em componentes que o fork reescreveu |
| direto | — | `3f848ccb` | 2026-10-08 | fix: remove data loss | 1 | 1 | **REVIEW** | remove --accept-data-loss do prisma-db-push; nosso CMD roda db push no boot — decidir política |
| direto | — | `47175b5a` | 2026-10-08 | feat: calendar line | 2 | 1 | **REVIEW** | UI upstream (responsivo/menu/settings/notificações) em componentes que o fork reescreveu |
| PR | #1884 | `91c91f63` | 2026-10-09 | fix(integrations): reconnecting a channel wiped its stored refresh token | 7 | 7 | **REVIEW** | refresh token/reconexão: fork tem reconexão Meta própria — portar linha a linha |
| PR | #2255 | `6cac1d23` | 2026-10-15 | fix(frontend): handle a failed /posts/valid response in the post modal | 1 | 1 | **REVIEW** | toca arquivo divergente — porte manual |
| PR | #2254 | `57e1a73c` | 2026-10-15 | fix(auth): align invite and showorg cookie lifetimes with the token expiry | 1 | 1 | **REVIEW** | toca arquivo divergente — porte manual |
| direto | — | `7113c6ce` | 2026-10-16 | feat: facebook | 8 | 4 | **REVIEW** | commit direto sem PR: inspecionar diff antes de decidir |
| PR | #2284 | `e454b8b5` | 2026-10-19 | fix(sentry): skip client init when Sentry is already initialized | 1 | 0 | **REVIEW** | config Sentry client: fork só tem server/edge config — verificar se aplica |
| PR | #2280 | `e7ceab7b` | 2026-10-19 | fix(sentry): mask replays and PII, cut span noise, rebalance sampling | 3 | 0 | **REVIEW** | config Sentry client: fork só tem server/edge config — verificar se aplica |
| direto | — | `31eda494` | 2026-10-19 | feat: better looking notifications | 2 | 2 | **REVIEW** | UI upstream (responsivo/menu/settings/notificações) em componentes que o fork reescreveu |
| direto | — | `f1a24b5f` | 2026-10-19 | feat: better looking notifications | 2 | 2 | **REVIEW** | UI upstream (responsivo/menu/settings/notificações) em componentes que o fork reescreveu |
| PR | #2301 | `6697e793` | 2026-10-21 | fix(frontend): keep blank lines when pasting plain text and make media tile names readable | 2 | 2 | **REVIEW** | toca arquivo divergente — porte manual |
| PR | #2298 | `a41e35f6` | 2026-10-21 | fix(integrations): re-adding an already connected page kept the old login's refresh token | 1 | 1 | **REVIEW** | refresh token/reconexão: fork tem reconexão Meta própria — portar linha a linha |
| PR | #1930 | `12136dcc` | 2026-09-15 | fix(reddit): strip leading/trailing slashes from subreddit names | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #1929 | `85b42a59` | 2026-09-15 | fix(bluesky): surface the underlying error when preparation keeps failing | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #1881 | `a15519ad` | 2026-09-15 | fix(facebook): flag channels holding a non-page token as needing reconnection | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #1875 | `a20d023f` | 2026-09-15 | fix(tiktok): correct picture_size_check_failed message and pre-check image sizes | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #1851 | `a3711609` | 2026-09-15 | fix(pinterest): read pin analytics from summary_metrics instead of lifetime_metrics | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #1767 | `07ebfc79` | 2026-09-15 | fix(linkedin-page): connecting a company page hijacks the personal LinkedIn channel | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #1946 | `08de8ccd` | 2026-09-15 | fix: count Threads post length in UTF-8 bytes | 3 | 2 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #1669 | `06381f06` | 2026-09-15 | fix(facebook): video/reel analytics via video_insights (no more nonexisting-field crash) | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2088 | `30ba6359` | 2026-09-16 | fix(instagram): send collaborators on carousel container instead of child items | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2084 | `3212ad54` | 2026-09-16 | fix(bluesky): don't disconnect the channel when Bluesky login fails with a 5xx | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #1892 | `0a4301ed` | 2026-09-16 | fix(facebook): map (#200) permission errors to a curated message | 2 | 2 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2107 | `ce6a7d28` | 2026-09-21 | fix(gmb): use Google's searchUrl as the post release URL | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2115 | `4fa33d52` | 2026-09-22 | fix(facebook): request the reels metrics in video post analytics | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2098 | `9c594d28` | 2026-09-22 | fix(facebook): surface Graph API errors in page analytics instead of caching an empty resu | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2134 | `4c33d525` | 2026-09-23 | fix(dribbble): map 4xx shot rejections to non-retryable BadBody errors | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2133 | `3540edc4` | 2026-09-23 | fix(x): map remaining known error responses to readable messages | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2132 | `135b1cc6` | 2026-09-23 | fix(x): mark the channel for reconnect on Unauthorized media upload errors | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2128 | `53fd19f1` | 2026-09-23 | fix(lemmy): surface Lemmy API errors instead of crashing on post_view | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2131 | `a722357e` | 2026-09-23 | fix(vk): surface VK API errors instead of marking posts completed | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2130 | `41d24f28` | 2026-09-23 | fix(x): readable message when Too Many Requests retries are exhausted | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2129 | `20d7c98c` | 2026-09-23 | fix(pinterest): validate board as a numeric id and map the board-name rejection | 3 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2127 | `5f8639b5` | 2026-09-23 | fix(facebook): map five recurring Graph API rejections instead of "Unknown Error" | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2126 | `35f174b7` | 2026-09-23 | fix(reddit): retry the submit after a RATELIMIT rejection instead of failing | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2125 | `4c81af95` | 2026-09-23 | fix(pinterest): make the numeric board id mapping actually match | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2124 | `61545387` | 2026-09-23 | fix(threads): retry publish when Threads has not found the container yet (4279009) | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2123 | `c4442245` | 2026-09-23 | fix(instagram): disconnect the channel on Meta checkpoint errors instead of failing every  | 2 | 2 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2152 | `9e8e749d` | 2026-09-25 | fix(instagram): map container error 2207085 to a curated video-format message | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2150 | `60431b08` | 2026-09-25 | fix: friendly message when Threads reports an UNKNOWN container error | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2144 | `767731a2` | 2026-09-25 | fix(facebook): fail reconnect cleanly when the page has no page token | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2137 | `1024d675` | 2026-09-25 | fix(instagram): curate container processing errors, map 2207082 to the silent-video audio  | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #1855 | `b2220ae1` | 2026-09-29 | feat(instagram): use custom thumbnail as reel cover via cover_url | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #1880 | `de396df4` | 2026-09-29 | fix(providers): wire the Moltbook settings DTO without making submolt required | 2 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2167 | `3cccf2ff` | 2026-09-29 | fix(facebook): retry the temporary posting-rate block (368 / 1390008) before failing | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2174 | `72d6015b` | 2026-09-29 | fix(tiktok): restore video cover frame selection on Direct Post | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2172 | `371d8ec7` | 2026-09-29 | fix(wordpress): send a Postiz User-Agent on requests to the WordPress site | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2182 | `33d33d10` | 2026-09-30 | fix(tiktok): keep the full public post id instead of the JSON.parse-rounded value | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2180 | `3f833068` | 2026-09-30 | fix(tiktok): resolve the public post id for FILE_UPLOAD publish ids in post analytics | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2179 | `b5ba8c89` | 2026-09-30 | fix(pinterest): map the "not permitted to access that resource" pin error | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2186 | `56f42d09` | 2026-10-02 | fix(tiktok): resolve and persist the public post id for analytics | 5 | 4 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2234 | `3a7d28b7` | 2026-10-12 | fix(instagram): point error 2207053 at Instagram's video limits | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2242 | `8c757118` | 2026-10-14 | fix(vk): surface VK API errors from the media upload calls | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2240 | `1004ca92` | 2026-10-14 | fix(tiktok): pre-check image sizes on TikTok Business channels | 1 | 0 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2239 | `8b84937c` | 2026-10-14 | fix(instagram): show the fallback message when the container status carries no detail | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2265 | `f4628143` | 2026-10-15 | fix(facebook): stop requesting total_video_impressions in video post analytics | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2263 | `ba8cb481` | 2026-10-15 | fix(pinterest): retry transient 'Something went wrong on our end' errors | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2264 | `fc29b825` | 2026-10-15 | fix(vk): call VK ID and VK API on the vk.ru domains | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2261 | `388da501` | 2026-10-15 | fix(instagram): make 'Media fetch failed' (2207052) retryable | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2260 | `cefb5e7c` | 2026-10-15 | fix(instagram): report untaggable collaborators instead of "Unknown Error" | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2257 | `0c935788` | 2026-10-15 | fix(youtube): clarify unverified-channel thumbnail error message | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2256 | `afdd37c1` | 2026-10-15 | fix(instagram): map the rejected comment error 1772107 to a readable message | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| PR | #2294 | `f534089c` | 2026-10-20 | fix(youtube): name the daily upload quota in the publish error | 1 | 1 | **PROVIDER** | lote por provider: portar mapeamento/erro linha a linha, conferindo auditorias de setembro |
| direto | — | `8c63e686` | 2026-09-24 | feat: schedule post preview url | 1 | 1 | **MCP** | tools MCP: fork tem chat/tools divergentes (profileId) — portar preservando auth.context |
| direto | — | `4583ac5d` | 2026-10-02 | feat: fix some tools | 2 | 1 | **MCP** | tools MCP: fork tem chat/tools divergentes (profileId) — portar preservando auth.context |
| direto | — | `28701a98` | 2026-10-03 | feat: mcp and skill description | 5 | 3 | **MCP** | tools MCP: fork tem chat/tools divergentes (profileId) — portar preservando auth.context |
| PR | #2119 | `78182edd` | 2026-10-05 | fix(calendar): surface curated provider errors in the calendar, public API and MCP | 4 | 3 | **MCP** | lote MCP (chat/tools divergentes) |
| PR | #1926 | `07745d1a` | 2026-10-07 | feat: list media via public API and MCP mediaListTool | 6 | 4 | **MCP** | tools MCP: fork tem chat/tools divergentes (profileId) — portar preservando auth.context |
| PR | #2249 | `0688bccc` | 2026-10-14 | feat(linkedin): expose company mention lookup to the public API and MCP | 3 | 3 | **MCP** | tools MCP: fork tem chat/tools divergentes (profileId) — portar preservando auth.context |
| PR | #2235 | `304538bb` | 2026-10-15 | fix(mcp): serve the streamable endpoints in Mastra's dual-era mode | 1 | 1 | **MCP** | tools MCP: fork tem chat/tools divergentes (profileId) — portar preservando auth.context |
| PR | #2175 | `b6d4f3d5` | 2026-10-20 | feat(mcp): accept { path, alt, thumbnail, thumbnailTimestamp } attachments | 1 | 1 | **MCP** | tools MCP: fork tem chat/tools divergentes (profileId) — portar preservando auth.context |
| PR | #2093 | `81d5a163` | 2026-09-17 | feat(oauth): accept client_secret_basic on the token endpoint | 5 | 2 | **P2** | OAuth app: client_secret_basic / token endpoint 200 (RFC 6749) |
| direto | — | `1752382c` | 2026-09-28 | feat: force token 200 | 1 | 0 | **P2** | OAuth app: client_secret_basic / token endpoint 200 (RFC 6749) |
| PR | #2155 | `7abbdde4` | 2026-09-29 | feat(facebook): optional title for feed video posts | 3 | 3 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #2183 | `496c3804` | 2026-09-30 | feat(groups): rename a channel group from the channel menu | 21 | 6 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| direto | — | `2aae02fe` | 2026-10-03 | feat: inline picture | 33 | 13 | **P2** | feature de produto (agendamento por grupo / imagem inline no editor) |
| PR | #2190 | `1af2885b` | 2026-10-05 | feat(channels): rename a channel in Postiz while keeping its original name | 26 | 9 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #2194 | `9e6b99c6` | 2026-10-05 | feat(calendar): open-post link icon that resolves the release URL on click | 19 | 5 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #1829 | `fc7f7645` | 2026-10-05 | fix(tags): readable calendar tag labels on any tag color | 1 | 1 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #1828 | `8630c487` | 2026-10-05 | feat(tags): expose tag editing in the tags dropdown | 18 | 2 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #2209 | `afa30c65` | 2026-10-06 | feat: auto text direction (RTL) in composer editor and previews | 12 | 11 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #2206 | `5cfdcccb` | 2026-10-06 | feat(calendar): frame published posts in green with a checkmark | 1 | 1 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #2205 | `86ba0f47` | 2026-10-06 | feat(calendar): channel multi-select filter above the calendar | 22 | 3 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #2204 | `f05a0498` | 2026-10-06 | fix(calendar): make the post delete icon and confirmation red, swap Delete and Preview | 3 | 2 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #2203 | `5007164f` | 2026-10-06 | feat: show login method in Global Settings | 18 | 3 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #2212 | `3128e870` | 2026-10-07 | feat(tiktok): connect UPLOAD drafts to the published post from the open-post icon | 5 | 4 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #2211 | `00ff6991` | 2026-10-07 | fix(calendar): open-post icon handles TikTok photo posts and links that are not ready | 21 | 6 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| direto | — | `a194e3f4` | 2026-10-07 | feat: group schedules | 29 | 13 | **P2** | feature de produto (agendamento por grupo / imagem inline no editor) |
| PR | #2221 | `23619478` | 2026-10-08 | fix(calendar): put Delete right-most in the post hover bar, after Preview and Duplicate | 1 | 1 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #2295 | `2d0d2872` | 2026-10-20 | feat(frontend): explain YouTube Shorts thumbnail behavior in the media settings section | 17 | 2 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #2285 | `8f4f72f7` | 2026-10-20 | feat(launches): set thumbnails and alt text from the post settings panel | 21 | 5 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #2302 | `3fee6a1c` | 2026-10-21 | feat(frontend): mention the phone-verified channel requirement in the thumbnails tooltip | 17 | 2 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #1856 | `c2ee7b4e` | 2026-10-21 | feat(media): pick video thumbnail from the media gallery | 2 | 2 | **P2** | feature de produto/UI — avaliar e portar com i18n pt-BR |
| PR | #2087 | `9bb641ef` | 2026-09-16 | fix: webhook payloads were always empty; resolve the post via releaseId fallback | 3 | 3 | **ÉPICO** | post.activity/workflows: entra no épico Temporal V112, não cherry-pick |
| direto | — | `1207941b` | 2026-09-17 | revert(chat): drop the boot-time Mastra storage init | 1 | 1 | **ÉPICO** | upgrade Mastra/CopilotKit (fork em @mastra/core 1.24) — épico IA isolado |
| direto | — | `e9245cad` | 2026-09-17 | fix(prisma): mirror every Mastra 1.67 table and column in schema.prisma | 1 | 1 | **ÉPICO** | upgrade Mastra/CopilotKit (fork em @mastra/core 1.24) — épico IA isolado |
| direto | — | `6b40c644` | 2026-09-17 | fix(chat): run the Mastra storage migration at boot with a retry | 1 | 1 | **ÉPICO** | upgrade Mastra/CopilotKit (fork em @mastra/core 1.24) — épico IA isolado |
| PR | #2193 | `11d24f3f` | 2026-10-02 | fix(media): bound media reads that stall after their headers | 4 | 3 | **ÉPICO** | post.activity/workflows: entra no épico Temporal V112, não cherry-pick |
| direto | — | `1f5f24e5` | 2026-10-04 | feat: workflow changes | 6 | 4 | **ÉPICO** | post.activity/workflows: entra no épico Temporal V112, não cherry-pick |
| direto | — | `185044d5` | 2026-10-04 | feat: fix workflows without continue as new | 2 | 0 | **ÉPICO** | post.activity/workflows: entra no épico Temporal V112, não cherry-pick |
| direto | — | `c3743d9e` | 2026-10-06 | feat: creation modal | 55 | 28 | **ÉPICO** | novo modal de criação (98 arquivos) — não portar; reavaliar como produto |
| direto | — | `48aa7e2c` | 2026-10-06 | feat: new creation modal | 43 | 21 | **ÉPICO** | novo modal de criação (98 arquivos) — não portar; reavaliar como produto |
| PR | #2258 | `a7666b5e` | 2026-10-15 | fix(youtube): keep the video id and URL on a post that fails only at the thumbnail step | 4 | 4 | **ÉPICO** | post.activity/workflows: entra no épico Temporal V112, não cherry-pick |
| direto | — | `2f671180` | 2026-10-18 | feat: change timezone | 51 | 21 | **ÉPICO** | timezone por usuário (51 arquivos, 21 divergentes) — avaliar como feature |
| direto | — | `c9382d98` | 2026-09-03 | feat: other agents | 5 | 3 | **SKIP** | onboarding/catálogo de agentes — decisão de 03/09 mantida |
| direto | — | `4f296fc0` | 2026-09-03 | feat: better onboarding | 4 | 3 | **SKIP** | onboarding/catálogo de agentes — decisão de 03/09 mantida |
| direto | — | `3cbe20b8` | 2026-09-12 | feat: wallet rejection | 2 | 0 | **SKIP** | streak/redeploy/staging CI/web3 do upstream |
| PR | #1997 | `6376fd95` | 2026-09-15 | feat(admin-stats): active orgs per post creation source | 2 | 0 | **SKIP** | admin/superadmin/impersonate SaaS |
| direto | — | `07fd99ef` | 2026-09-16 | ci: regenerate the lockfile instead of merging it in staging conflicts | 1 | 0 | **SKIP** | streak/redeploy/staging CI/web3 do upstream |
| direto | — | `b3cace23` | 2026-09-16 | fix: runpod | 1 | 1 | **SKIP** | clipping/RunPod/Deepgram (infra SaaS) |
| direto | — | `914b29f0` | 2026-09-16 | feat: replace | 2 | 2 | **SKIP** | clipping/RunPod/Deepgram (infra SaaS) |
| direto | — | `e2d5b9c5` | 2026-09-16 | feat: runpod | 22 | 12 | **SKIP** | clipping/RunPod/Deepgram (infra SaaS) |
| PR | #2091 | `83bd0808` | 2026-09-17 | fix(oauth): grant email claims to DCR clients on verified domains | 14 | 10 | **SKIP** | DCR/ChatGPT app: nova superfície OAuth não autenticada; fork não tem DCR |
| direto | — | `48490b81` | 2026-09-17 | feat(mcp): serve the ChatGPT app on /mcp-oauth-chatgpt | 1 | 1 | **SKIP** | DCR/ChatGPT app: nova superfície OAuth não autenticada; fork não tem DCR |
| direto | — | `2a0d6885` | 2026-09-17 | feat(mcp): separate no-DCR issuer for /mcp-oauth, DCR issuer for the rest | 1 | 1 | **SKIP** | DCR/ChatGPT app: nova superfície OAuth não autenticada; fork não tem DCR |
| PR | #2096 | `01219ef9` | 2026-09-18 | feat: superuser public API endpoints | 13 | 9 | **SKIP** | admin/superadmin/impersonate SaaS |
| PR | #2099 | `b9e80d05` | 2026-09-18 | feat(mcp): upload widget for uploading local files from Claude and ChatGPT | 14 | 5 | **SKIP** | upload widget/ajuste RunPod (MCP cloud) |
| direto | — | `c3e06973` | 2026-09-18 | fix: require a search term and allow targeting deleted orgs with the include-deleted header | 2 | 2 | **SKIP** | admin/superadmin/impersonate SaaS |
| direto | — | `9485ca50` | 2026-09-18 | feat: add x-postiz-include-deleted header for the debug endpoints | 7 | 5 | **SKIP** | admin/superadmin/impersonate SaaS |
| direto | — | `ee3eaa60` | 2026-09-18 | feat(staging-conflicts): stop crashing the workflow | 1 | 0 | **SKIP** | streak/redeploy/staging CI/web3 do upstream |
| PR | #2104 | `6f107801` | 2026-09-19 | feat(clipping): YouTube video clipping workflow (REST + MCP tools + widget) | 52 | 19 | **SKIP** | clipping/RunPod/Deepgram (infra SaaS) |
| PR | #2111 | `901f84ff` | 2026-09-21 | feat(public-api): clipping endpoints | 1 | 1 | **SKIP** | clipping/RunPod/Deepgram (infra SaaS) |
| direto | — | `fc14ff16` | 2026-09-21 | feat: clipping | 1 | 0 | **SKIP** | clipping/RunPod/Deepgram (infra SaaS) |
| direto | — | `87ac77c6` | 2026-09-22 | feat: update readme | 17 | 1 | **SKIP** | docs/README/CLAUDE.md do upstream (#2191 vira regra no nosso CLAUDE.md) |
| direto | — | `8b84b0dc` | 2026-09-22 | feat: onboarding | 2 | 2 | **SKIP** | onboarding/catálogo de agentes — decisão de 03/09 mantida |
| direto | — | `c0238437` | 2026-09-22 | feat: update chatgpt submission | 1 | 0 | **SKIP** | DCR/ChatGPT app: nova superfície OAuth não autenticada; fork não tem DCR |
| direto | — | `6af357dd` | 2026-09-22 | feat: update chatgpt submission | 1 | 0 | **SKIP** | DCR/ChatGPT app: nova superfície OAuth não autenticada; fork não tem DCR |
| direto | — | `3d3e9eee` | 2026-09-22 | feat: update chatgpt submission | 1 | 0 | **SKIP** | DCR/ChatGPT app: nova superfície OAuth não autenticada; fork não tem DCR |
| direto | — | `5ff9e0b2` | 2026-09-23 | feat: update readme | 1 | 1 | **SKIP** | docs/README/CLAUDE.md do upstream (#2191 vira regra no nosso CLAUDE.md) |
| direto | — | `c33f2188` | 2026-09-23 | feat: update readme | 1 | 1 | **SKIP** | docs/README/CLAUDE.md do upstream (#2191 vira regra no nosso CLAUDE.md) |
| PR | #2079 | `33e126a9` | 2026-09-24 | feat(preview): inline comments, replies, resolve and anonymous commenting | 33 | 13 | **SKIP** | comentários anônimos no preview = nova superfície pública de escrita; fork tem revisão/aprovação própria (reavaliar como produto) |
| direto | — | `bb5099a8` | 2026-09-24 | feat: connected clients | 2 | 0 | **SKIP** | conector self-hosted/Canva/clientes conectados (Postiz Cloud) |
| PR | #2151 | `fbd089f6` | 2026-09-25 | fix(billing): show a message when Stripe.js fails to load instead of crashing | 17 | 3 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
| PR | #2159 | `73a0dea9` | 2026-09-28 | fix(frontend): keep the 402 response readable and stay on Add Channel after cancel | 2 | 2 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
| direto | — | `cd48401e` | 2026-09-28 | feat: canva intent | 2 | 2 | **SKIP** | conector self-hosted/Canva/clientes conectados (Postiz Cloud) |
| PR | #2184 | `2a46d88c` | 2026-09-30 | docs(claude): add shared-query and persisted-data change rules | 1 | 1 | **SKIP** | docs/README/CLAUDE.md do upstream (#2191 vira regra no nosso CLAUDE.md) |
| direto | — | `28008079` | 2026-09-30 | redeploy | 1 | 0 | **SKIP** | streak/redeploy/staging CI/web3 do upstream |
| PR | #2191 | `e0a08a7d` | 2026-10-01 | docs(claude): add a rule on credentials and sensitive fields in responses | 1 | 1 | **SKIP** | docs/README/CLAUDE.md do upstream (#2191 vira regra no nosso CLAUDE.md) |
| PR | #2195 | `39645364` | 2026-10-02 | docs(security): a role address for time-critical reports instead of a personal one | 1 | 0 | **SKIP** | docs/README/CLAUDE.md do upstream (#2191 vira regra no nosso CLAUDE.md) |
| direto | — | `876ab9e6` | 2026-10-02 | feat: self hosting connector | 32 | 11 | **SKIP** | conector self-hosted/Canva/clientes conectados (Postiz Cloud) |
| direto | — | `f28c2522` | 2026-10-04 | feat: make ugc | 1 | 1 | **SKIP** | branding/menu upstream (UGC, Agents/Dev) |
| direto | — | `273c7b50` | 2026-10-04 | feat: streak load | 5 | 5 | **SKIP** | streak/redeploy/staging CI/web3 do upstream |
| direto | — | `36834cda` | 2026-10-04 | fix: typo in password reset email | 1 | 1 | **SKIP** | typo em e-mail inglês; fork tem e-mails i18n próprios |
| direto | — | `f65de34e` | 2026-10-04 | feat: redeploy backend and mcp | 0 | 0 | **SKIP** | streak/redeploy/staging CI/web3 do upstream |
| PR | #2061 | `86b3c3dd` | 2026-10-05 | fix: guard against duplicate Stripe subscriptions per customer | 2 | 1 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
| PR | #2160 | `78558e93` | 2026-10-05 | feat(subscription): re-enable disabled channels when the new plan can hold all of them | 21 | 7 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
| PR | #2202 | `5d8ce5aa` | 2026-10-05 | docs(claude): code invoked by external webhooks must not throw | 1 | 1 | **SKIP** | docs/README/CLAUDE.md do upstream (#2191 vira regra no nosso CLAUDE.md) |
| PR | #2112 | `e55121d8` | 2026-10-05 | fix(billing): persist cancelAt on cancel/reactivate instead of waiting for the webhook | 5 | 4 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
| PR | #2210 | `22c03418` | 2026-10-06 | feat(sponsors): re-add chatbotx to readme | 1 | 1 | **SKIP** | docs/README/CLAUDE.md do upstream (#2191 vira regra no nosso CLAUDE.md) |
| PR | #2208 | `109e8d4c` | 2026-10-06 | fix(permissions): look up the refreshed channel by internalId in the channel limit check | 2 | 2 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
| PR | #2216 | `1396b215` | 2026-10-07 | feat: point MCP upload tools to the CLI and public API for private files | 3 | 0 | **SKIP** | upload widget/ajuste RunPod (MCP cloud) |
| PR | #2215 | `c45ce4a7` | 2026-10-07 | fix(instagram): map the Trial Reel publish limit error to a readable message | 1 | 1 | **SKIP** | billing/Stripe desabilitado no fork |
| direto | — | `4c5d42a9` | 2026-10-08 | feat: superadmin public api endpoint to reset an org's ai credits | 4 | 3 | **SKIP** | admin/superadmin/impersonate SaaS |
| direto | — | `8f3c38ab` | 2026-10-08 | feat: fix invoices | 18 | 3 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
| direto | — | `3bd88cee` | 2026-10-08 | feat: professional billing | 22 | 5 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
| PR | #2226 | `6c504570` | 2026-10-09 | fix(account): ignore disabled team members when deleting an account | 2 | 1 | **SKIP** | delete account (feature SaaS; fork não expõe) |
| PR | #2253 | `25916f12` | 2026-10-14 | feat(billing): show the renewal date and remaining AI credits on the billing page | 21 | 5 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
| PR | #2241 | `b664f5f9` | 2026-10-14 | fix(auth): prefer an org with a subscription as the default active org | 1 | 1 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
| PR | #2237 | `26c4c3ba` | 2026-10-14 | fix(billing): warn about team members only when they exist, and say they are disabled | 1 | 1 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
| PR | #2236 | `53560529` | 2026-10-14 | fix(account): cancel the subscription and remove team members on account deletion | 4 | 2 | **SKIP** | delete account (feature SaaS; fork não expõe) |
| direto | — | `b1a28b17` | 2026-10-14 | feat: hubspot | 7 | 3 | **SKIP** | HubSpot (integração cloud) |
| PR | #2267 | `6634bb7e` | 2026-10-15 | feat(hubspot): explain the HubSpot install on the calendar | 19 | 3 | **SKIP** | HubSpot (integração cloud) |
| direto | — | `20609d33` | 2026-10-15 | feat: hubspot integration | 7 | 2 | **SKIP** | HubSpot (integração cloud) |
| direto | — | `0956d49a` | 2026-10-15 | feat: hubspot | 4 | 2 | **SKIP** | HubSpot (integração cloud) |
| PR | #2283 | `4e37d00a` | 2026-10-19 | fix(autopost): say autopost creates drafts and drop the unused post-timing option | 17 | 2 | **SKIP** | wording do autopost upstream; fork tem autopost próprio |
| PR | #2279 | `8f88ecac` | 2026-10-19 | feat(settings): rename the Agents settings tab to Agents / Dev | 21 | 5 | **SKIP** | branding/menu upstream (UGC, Agents/Dev) |
| PR | #2296 | `651876e2` | 2026-10-20 | chore(mcp): add mediaListTool, mediaStatusTool and deletePostTool to the ChatGPT app submi | 1 | 0 | **SKIP** | DCR/ChatGPT app: nova superfície OAuth não autenticada; fork não tem DCR |
| PR | #2288 | `fd6afd58` | 2026-10-20 | fix(admin-stats): run stat groups sequentially to bound DB pool usage | 1 | 0 | **SKIP** | admin/superadmin/impersonate SaaS |
| PR | #2292 | `e2be3ecb` | 2026-10-20 | fix(mcp): keep the upload widget adjust tooltip inside the widget | 1 | 0 | **SKIP** | upload widget/ajuste RunPod (MCP cloud) |
| PR | #2281 | `49968111` | 2026-10-20 | feat(media): opt-in adjust to platform limits on API, MCP and widget uploads | 9 | 4 | **SKIP** | upload widget/ajuste RunPod (MCP cloud) |
| PR | #2286 | `663e0a31` | 2026-10-20 | feat: invoice history icon in top bar, visible under the billing paywall | 20 | 4 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
| PR | #2287 | `3c7b40c3` | 2026-10-20 | fix(deepgram): opt clipping transcriptions out of Deepgram's model improvement program | 1 | 0 | **SKIP** | clipping/RunPod/Deepgram (infra SaaS) |
| PR | #2113 | `a2ee36ef` | 2026-10-20 | feat(billing): make finishing the trial discoverable (billing button + API/MCP error hint) | 19 | 4 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
| PR | #1924 | `162906cf` | 2026-10-20 | Complete 3DS challenges in-app for fast-track and upgrade charges | 21 | 5 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
| PR | #2303 | `c06abc3d` | 2026-10-21 | fix(billing): say what ending the trial charges | 20 | 6 | **SKIP** | billing/Stripe (DISABLE_BILLING=true no fork) |
