# Prova Meta para automações compartilhadas

Estado em 21/10/2026: implementação da **etapa 0** em andamento. Receptor isolado de captura preparado em Docker/HTTPS para Escorpiano; callback `page/feed` cadastrado e confirmado ativo no aplicativo de teste compartilhado, após autorização explícita. A inscrição `feed` da Página aguarda autorização válida pelo novo painel do MultiPost. A opção 2 continua sendo o objetivo. O produto agora registra configuração e diagnóstico próprios, reutilizando o parser; o adaptador de envio da prova continua separado dos workers. Não há migração nem mudança de comportamento do Instagram.

**Orientação posterior do usuário:** este runbook é uma ferramenta de desenvolvimento, não o roteiro de instalação dos alunos. O pedido de token avulso em arquivo foi suspenso como próxima ação padrão. A autorização pelo login e a inscrição seletiva já foram implementadas; seguir o [manual pelo painel](facebook-automation-panel.md), que também ensina a configuração manual do webhook na Meta. O aceite real dessa jornada ainda está pendente. Qualquer continuação excepcional da prova manual deve ser guiada e identificada como teste, sem apresentar operações do agente como funcionalidades prontas do produto.

## Evidência documental e limite da validação

A documentação de [Private Replies](https://developers.facebook.com/docs/messenger-platform/discovery/private-replies) confirma Page Access Token, tarefa `MESSAGING`, permissão `pages_messaging` e `POST /PAGE-ID/messages` com `recipient.comment_id`. A resposta inicial possui janela própria; não autoriza uma sequência de mensagens sem interação posterior. A versão é a constante do projeto, atualmente `v25.0`.

A consulta de 19/10/2026 recuperou uma cópia indexada dessa página, com exemplo antigo v21. As referências de [webhooks de Páginas](https://developers.facebook.com/docs/pages-api/webhooks-for-pages/), [assinaturas](https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/), [debug_token](https://developers.facebook.com/docs/graph-api/reference/debug_token/) e [botão](https://developers.facebook.com/docs/messenger-platform/reference/templates/button/) retornaram bloqueio temporário/429. Não tratar essas leituras incompletas como comprovação atual do aplicativo.

Em 21/10, a referência oficial de [Page Subscribed Apps v25.0](https://developers.facebook.com/docs/graph-api/reference/v25.0/page/subscribed_apps/) abriu no navegador. Ela confirma que eventos só são entregues para campos assinados tanto no aplicativo quanto na Página. O POST documenta `subscribed_fields`; não há parâmetro de callback exclusivo por Página nessa referência. Não usar override não documentado para contornar o fato de o aplicativo ser compartilhado.

O preflight confere identidade da Página, aplicativo emissor, validade/expiração do token, permissões, ativos explicitamente limitados por `granular_scopes`, assinatura `feed` do aplicativo correto e leitura de publicações. A lista de permissões para a prova inclui `pages_messaging`, `pages_manage_metadata`, `pages_read_engagement` e `pages_read_user_content`; resposta pública acrescenta `pages_manage_engagement`. Esses requisitos ainda precisam ser confrontados com o aplicativo/Página real. Escopo concedido não comprova tarefa `MESSAGING`, App Review ou entrega de mensagem.

Resultado `PREFLIGHT_PASSED` significa somente que as consultas passaram. `liveProofRequired: true` continua presente. A aprovação do gate exige receber comentário assinado e confirmar a mensagem em uma Página de teste identificada pelo responsável.

## Preflight real — 21/10/2026

Página escolhida pelo usuário: **Escorpião Veneno**, `271852286004401`; integração `cmvi6us6q0005pm090b98kalb`, perfil Escorpiano. Aplicativo cadastrado: `841571281566716`. Às 14:57 (America/Sao_Paulo), uma consulta de identidade confirmou a Página e a inspeção somente leitura retornou `BLOCKED / PERMISSIONS_MISSING`: faltam `pages_messaging` e `pages_manage_metadata`. Não houve envio, mudança de assinatura ou alteração de credenciais. As credenciais foram resolvidas do perfil exato e mantidas em memória; a saída guardada contém apenas metadados e códigos.

Como o preflight interrompe nesse bloqueio, a assinatura `feed` e as publicações ainda não foram consultadas. Não interpretar a lista vazia do resultado como ausência de posts. Confirmar acesso ao aplicativo, obter a autorização necessária e repetir a inspeção antes do teste de webhook/mensagem. A conexão OAuth de publicação atualmente não solicita essas duas permissões; reconectar pelo mesmo fluxo, sem tratar essa diferença, não comprova acesso à automação.

As páginas oficiais consultadas novamente nesta data retornaram HTTP 429; o resultado acima vem das chamadas reais à Graph API v25.0 e do contrato de inspeção existente, não de uma nova comprovação documental completa.

### Segunda inspeção — autorização temporária para teste

Após adicionar o caso de uso Messenger, o usuário informou o estado **Pronto para teste** e autorizou uma inspeção com novo token temporário de usuário. Por volta de 16:02 (America/Sao_Paulo), `debug_token` confirmou token válido, tipo `USER`, aplicativo emissor correto e as cinco permissões solicitadas: `pages_messaging`, `pages_manage_metadata`, `pages_show_list`, `pages_read_engagement` e `pages_read_user_content`.

Uma leitura de `271852286004401?fields=id,name,access_token` obteve em memória o token da Página **Escorpião Veneno**. O adaptador de prova validou esse Page token e retornou `BLOCKED / FEED_SUBSCRIPTION_MISSING`, com `missingPermissions: []`. A consulta `published_posts` desta vez foi executada e retornou zero itens; isso registra o resultado da API para essa autorização, sem afirmar que a Página não possui conteúdo. A consulta das tarefas da Página confirmou `MESSAGING`, `MANAGE`, `MODERATE` e outras tarefas de gestão.

Uma consulta independente a `841571281566716/subscriptions` com a credencial do próprio aplicativo retornou HTTP 200, lista vazia e sem próxima página. Portanto, além da assinatura `feed` ausente no vínculo Página/aplicativo, não havia callback de objeto cadastrado nesse aplicativo no momento da leitura. Essa conclusão é específica deste aplicativo; não descreve outros aplicativos usados pelo Instagram.

Todas as operações foram GETs. O token fornecido entrou por stdin sem eco; os tokens e segredos ficaram apenas em memória e não foram gravados em arquivo, banco, argumentos de processo ou saída. A integração cadastrada no MultiPost continua com sua credencial anterior. Nenhuma permissão, assinatura, callback ou mensagem foi alterada. O token temporário não deve ser tratado como credencial persistente da integração.

Naquele momento, faltavam receptor HTTPS, callback do objeto `page`, assinatura `feed` e publicação de teste. Receptor, post e callback foram preparados nas etapas seguintes, descritas abaixo. Ainda será necessário renovar a autorização, inscrever a Página, repetir o preflight e capturar um comentário novo. O estado **Pronto para teste** e as permissões concedidas não comprovam App Review/acesso para todos os usuários nem entrega de mensagem.

### Receptor exclusivo do Escorpiano — preparado em 21/10

O usuário autorizou inicialmente a preparação somente para o perfil Escorpiano. A auditoria somente leitura encontrou o aplicativo `841571281566716` em **dois cadastros de credencial de perfil** no banco local; a Página `271852286004401` possui somente a integração esperada. Nenhum cadastro, credencial ou flow foi alterado. O callback foi inicialmente adiado por pertencer ao aplicativo compartilhado. Na rodada seguinte, o usuário autorizou explicitamente usar esse aplicativo de teste e pediu validar também o cenário de várias Páginas em um aplicativo; a ativação efetiva está registrada abaixo.

O [post de teste enviado pelo usuário](https://www.facebook.com/share/p/1DsHnUeoAy/) foi identificado como **Inspiração**, criado em 21/10/2026 às 16:08 (America/Sao_Paulo). A API retornou `271852286004401_122321127302221279`. O permalink da API e o link compartilhado foram abertos no navegador e apontaram para o mesmo `story_fbid`, confirmando a associação apesar dos diferentes identificadores públicos usados pelo Facebook. Essa identificação é somente leitura: nenhum comentário ou mensagem foi criado.

**Callback preparado:** `https://localmultipostapi.automacaosemlimites.com.br/public/fb-webhook-proof`. É uma rota de homologação, separada da futura rota de produto `/public/fb-webhook` e de `/public/ig-webhook`. O único processo que a atende é o serviço Docker opcional `meta-proof`; o NestJS não registra o receptor.

Contrato de entrada:

| Requisição | Resposta e efeito |
|---|---|
| GET com `hub.mode=subscribe`, token de verificação correto e challenge numérico | `200`, somente challenge; comparação do token em tempo constante para valores de mesmo tamanho. |
| GET inválido/ambíguo | `403 VERIFICATION_FAILED`. Parâmetros duplicados são recusados. |
| POST JSON com HMAC-SHA256 válido e todas as entradas da Página configurada | `200 CAPTURED` somente após publicação atômica/durável dos arquivos; repetição íntegra retorna `200 DUPLICATE`. |
| POST de outra Página, lote misto ou objeto Instagram | `200 IGNORED`, sem gravar o corpo; o lote misto inteiro é descartado, inclusive a entrada da Página de teste. |
| Assinatura ausente, malformada ou incorreta | `401 INVALID_SIGNATURE`, sem captura; HMAC precede interpretação de JSON. |
| JSON/envelope inválido | `400`; objeto/entradas validados depois da assinatura. |
| Corpo acima de 1 MiB | `413`, no proxy e no processo; inclui transferência chunked. |
| Tipo diferente de JSON ou corpo comprimido | `415`. |
| Método não suportado / caminho diferente | `405` / `404`. |
| Falha de armazenamento, captura anterior incompleta ou quota esgotada | `503 CAPTURE_UNAVAILABLE`, sem confirmar captura bem-sucedida. |

O contexto vem exclusivamente da configuração privada fixa: aplicativo, Página, integração, organização e perfil. IDs de perfil enviados no payload não selecionam credenciais. A captura guarda eventos assinados da Página mesmo quando o parser conservador ainda não reconhece comentários; `acceptedComments: null` registra esse limite, sem transformar o evento em comentário elegível. O receptor não contém operação de envio, cliente Prisma, token de Página/usuário ou cliente Temporal.

Limites: até oito POSTs em processamento, 32 conexões, timeouts de dez segundos e **100 diretórios de captura**. O Nginx impõe orçamento global exclusivo dessa rota de cinco requisições/segundo com burst de 20, respondendo `429`; as rotas normais mantêm sua configuração. Buffering de request e de resposta ficam desligados nessa localização, com corpo máximo de 1 MiB. Logs de acesso/erro da rota ficam desligados para não registrar o token de challenge. Erros do processo não imprimem request, corpo ou configuração.

Após a autorização para verificar várias Páginas, o CLI passou a emitir registros `META_PAGE_WEBHOOK` exclusivamente para envelopes `page` autenticados e válidos: `appId`, `expectedPageId`, `pageIds` numéricos únicos, `entryCount` e `decision`. Não inclui comentário, autor, assinatura, token, segredo ou payload. IDs são limitados a 32 dígitos e o lote a 100 entradas; envelope/ID inválido retorna `400`, sem diagnóstico. Capturas completas continuam limitadas ao Escorpiano; IDs de outras Páginas podem constar nos logs, mas seus corpos não são persistidos. Instagram permanece ignorado, sem diagnóstico.

Decisões possíveis: `CAPTURED`, `DUPLICATE`, `IGNORED_OTHER_PAGE` e `IGNORED_MIXED_PAGES`. As duas primeiras só são emitidas depois da persistência; falhas síncronas/assíncronas do observador ou stream não alteram a resposta. O CLI descarta novos diagnósticos quando stdout acumula 64 KiB; Docker mantém até três arquivos de log de 1 MiB. Os logs são observação de melhor esforço, não ledger nem prova de ausência de eventos. Consultar com `docker logs --timestamps --since 10m multipost-facebook-local-meta-proof-1`.

### Arquivos privados e inicialização do receptor

Arquivo de configuração já preparado localmente: `.secrets/meta-webhook-escorpiano/config/receiver.json`, modo `600`, diretório `700`. Contém o contexto exato acima, `appSecret` obtido da credencial do perfil exato e `verifyToken` aleatório de 32 bytes em hexadecimal. **Não contém access tokens.** Não colar esses valores no chat ou versionar o arquivo. O loader recusa arquivo público, symlink, contexto vazio e campos adicionais; não carrega `.env` nem consulta o banco. A preparação inicial consulta o banco apenas para validar a origem da configuração, fora do processo receptor.

Capturas ficam em `.secrets/meta-webhook-escorpiano/captures/<sha256-do-corpo>/`, diretórios `700`, com três arquivos `600`:

- `webhook.json`: bytes exatos do corpo, sem reformatar.
- `signature.txt`: assinatura original.
- `metadata.json`: contexto do servidor, horário e número de comentários reconhecidos, sem app secret ou texto da mensagem.

Os dois primeiros arquivos são compatíveis com o CLI de prova existente. O processo grava e sincroniza os três arquivos em diretório temporário privado, renomeia o diretório completo e sincroniza o pai antes de responder. Duplicatas conferem a integridade do corpo/assinatura/contexto existentes. Diretórios temporários órfãos também contam na quota. Não escalar esse serviço para múltiplas réplicas: a fila da quota é de processo único, e o receptor não substitui o ledger transacional da V2.

Não há expurgo automático ou retenção por tempo nesta ferramenta de homologação. Encerrar a captura depois da prova, registrar somente evidências sanitizadas e remover os arquivos privados de captura quando não forem mais necessários. Em quota esgotada ou diretório `.pending-*`, inspecionar os arquivos locais antes de liberar espaço; não apagar o ledger de tentativas de envio para repetir uma mensagem.

Adicionar o quarto overlay somente para o receptor:

```bash
docker compose --env-file .secrets/multipost-local.env \
  -f docker-compose.local.yaml -f docker-compose.tunnel.yaml \
  -f docker-compose.restored.yaml -f docker-compose.meta-proof.yaml \
  up -d --no-build --no-deps --wait --wait-timeout 60 meta-proof
```

Para subir toda a stack com o receptor, usar os mesmos quatro arquivos e `up -d --no-build --wait --wait-timeout 300`, sem `--no-deps` e sem limitar o serviço. Nunca omitir o overlay restaurado e nunca usar `down -v`. Para encerrar somente a captura, usar o mesmo prefixo Compose com `stop meta-proof`; isso preserva banco, aplicativo e capturas. O receptor não publica porta no host, usa root filesystem somente leitura e monta apenas o código necessário, configuração privada e pasta de capturas. Não herda `env_file`/credenciais do serviço principal.

Depois de editar somente a configuração Nginx montada, validar com `docker exec multipost-facebook-local-app-1 nginx -t` e aplicar com `docker exec multipost-facebook-local-app-1 nginx -s reload`; não é necessário reiniciar backend/frontend. A resolução Docker DNS da rota é feita por requisição, permitindo iniciar a stack normal sem o serviço opcional; nesse caso apenas a rota de prova fica indisponível.

Execução fora do Docker, quando necessária: `pnpm automations:meta-webhook <config-privado.json> <diretorio-privado-de-capturas>`. Por padrão escuta somente `127.0.0.1:3033`; o Compose fornece explicitamente bind `0.0.0.0` dentro da rede Docker.

### Validação do receptor preparado

RED inicial observado por módulo ausente; 17 casos novos de HTTP/filesystem/CLI, incluindo processo real e encerramento SIGTERM. Regressão combinada: **21 suítes / 337 testes aprovados**, exit code 0, 39,666 s. Typecheck dedicado, Compose e sintaxe Nginx aprovados. Revisões funcional e de segurança sem achados pendentes após incluir teste do launcher e limitação de frequência no proxy.

No incremento de diagnóstico, oito casos adicionais cobrem IDs malformados, projeção mínima, falhas de observador/stream, limite de buffer e roteamento do parser por duas Páginas com o mesmo segredo e perfis distintos. RED por export/argumento ausentes observado; GREEN específico com 44 casos/3 suítes. Nova regressão completa: **345 testes / 21 suítes**, 36,573 s, exit code 0. Typecheck e Compose aprovados; revisões funcional e de segurança sem achados no incremento. Esses testes sintéticos não comprovam entrega real da Meta para várias Páginas.

Aplicado recriando somente `meta-proof`, confirmado saudável e com rotação de logs efetivamente carregada. Smoke HTTPS sintético com Página fictícia `999`, lote misto e repetição da captura anterior retornou, respectivamente, `IGNORED`, `IGNORED` e `DUPLICATE`, todos HTTP 200. A lista de diretórios de captura permaneceu idêntica. Logs continham somente as chaves permitidas e decisões correspondentes, sem segredo, token de verificação, texto ou autor fictício. Login público e raiz da API continuaram HTTP 200; container principal saudável. Esses três registros são testes locais assinados, não eventos recebidos da Meta. Conferência final das assinaturas confirmou somente `page`, callback correto e ativo. O novo arquivo de token ainda não estava disponível ao encerrar esta rodada.

Serviço Docker saudável e teste pelo domínio HTTPS: challenge correto `200`, HMAC inválido `401`, Página estrangeira/lote misto ignorados sem persistência, captura sintética aceita e duplicata reconhecida com bytes/assinatura preservados. Reinício somente do receptor preservou a captura e retornou novamente `200 DUPLICATE`. Pelo proxy, corpo excedente retornou `413` e rajada atingiu `429`. API e login públicos continuaram `200`. Inspeção do container confirmou ausência de ambiente de banco/Redis/JWT, nenhuma porta publicada e root filesystem somente leitura; verificação de logs não encontrou app secret, verify token ou corpo sintético.

A única captura produzida nessa validação inicial tem `proof_source=LOCAL_SYNTHETIC_SMOKE_2026_10_21`, sem comentário, `acceptedComments=0`. **Não é entrega real da Meta nem prova de recebimento Messenger.** A ativação remota ocorreu depois, conforme abaixo. O teste HTTPS utilizou Node fetch; um cliente Python urllib foi bloqueado pelo Cloudflare com código 1010, sem mudança de configuração Cloudflare.

### Ativação do callback no aplicativo compartilhado — 21/10

Após a autorização da opção 1, a leitura de `841571281566716/subscriptions` foi repetida e confirmou lista vazia, sem paginação. O challenge HTTPS local passou. Foi executado um único POST nessa aresta com `object=page`, `fields=feed`, `include_values=true`, callback de homologação acima e token de verificação privado. A Meta retornou HTTP 200 e `success=true`; a leitura posterior confirmou `active=true`, URL exata e campo `feed` na versão `v25.0`. Nenhuma assinatura de objeto Instagram foi criada, removida ou substituída.

Isso configura o destino dos eventos do objeto `page` no aplicativo; não inscreve automaticamente todas as Páginas acessíveis ao aplicativo. A [referência oficial de App Subscriptions](https://developers.facebook.com/docs/graph-api/reference/app/subscriptions/) e a referência de Page Subscribed Apps exigem também a associação Página/aplicativo e o campo correspondente. O mesmo callback pode receber eventos de várias Páginas inscritas; o roteamento de cada entrada deve usar `entry.id` e o vínculo de integração/perfil validado no servidor. Acesso a um Instagram no mesmo aplicativo não transforma eventos `instagram` em `page/feed`.

O `debug_token` do token temporário retornou `is_valid=false`, `code=190`, expiração `2026-10-21T20:00:00Z` (17h em São Paulo). A inscrição de Página ainda não foi executada. Foi solicitada renovação em arquivo local privado `.secrets/meta-webhook-escorpiano/user-token.txt`, modo `600`, sem token no chat. Depois de receber a autorização válida: conferir identidade/app/permissões; derivar somente o Page token necessário em memória; ler a inscrição atual e preservar seus campos ao acrescentar `feed` para `271852286004401`; confirmar por nova leitura. A inspeção das demais Páginas é somente leitura, sem inscrição ou envio em lote.

Não reexecutar o POST de callback em uma retomada sem ler o estado atual. Não apagar todas as assinaturas do aplicativo para refazer o teste. Caso outro callback seja configurado posteriormente, tratar a divergência antes de qualquer alteração.

## Contratos preparados

- `MetaAutomationGraphClient`: host e versão centrais, credencial autenticadora no header, timeout de 15 segundos, redirect recusado, transporte SSRF existente e uma tentativa por operação. A exceção é o token **inspecionado**: `debug_token` exige o Page token como `input_token` na query; nunca registrar a URL completa dessa consulta. Erros persistíveis contêm somente categoria, HTTP, `code` e `error_subcode`; nunca o corpo bruto.
- `FacebookCommentAutomationAdapter`: inspeção somente leitura, primeira mensagem com texto/URL ou botão URL e resposta pública. Limites locais conservadores de 2.000 caracteres para texto, 640 no template e 20 no título; validar na prova real antes de publicar capabilities definitivas.
- `parseFacebookCommentWebhook`: HMAC-SHA256 dos bytes originais e contexto de credencial por Página/organização/perfil; ignora edição, remoção, comentário próprio e formatos ambíguos. Apenas comentário raiz com `post_id` composto é normalizado nesta prova. Fotos/álbuns/Reels/respostas precisam de fixtures reais antes de ampliar o parser.

`SENT` exige ID remoto. Timeout, falha de rede, 5xx, resposta inválida ou sucesso sem ID são `UNKNOWN`: não repetir automaticamente. Uma rejeição explícita da API fica `FAILED`, preservando code/subcode sem confundir code 190 com permissão ausente. O adaptador não substitui o ledger transacional da V2; não deve ser chamado diretamente por webhook/worker de produção.

## Gate de saída ainda pendente

- [ ] Identificar ambiente, Página e conta de teste autorizados.
- [ ] Confirmar App Review/acesso, tarefa de messaging, token e assinatura corretos.
- [ ] Capturar fixture real sanitizada de comentário orgânico e verificar formato.
- [ ] Confirmar primeira mensagem com URL e botão em comentários de teste distintos.
- [ ] Confirmar resposta pública opcional e repetição da mesma pessoa.
- [ ] Exercitar formatos foto/álbum/Reel, replies e eventos inelegíveis.
- [ ] Registrar resultados sem tokens ou conteúdo pessoal.

Sem essa evidência não ativar Facebook, não substituir o motor Instagram e não declarar a etapa 0 concluída. Falta de acesso Messenger também bloquearia a opção 1; não é motivo para abandonar a configuração compartilhada.

## Executar a prova

Pré-requisitos: Node 22 compatível com `engines`, PNPM 10.6.1 e dependências já instaladas. Executar os comandos da raiz do repositório. A ferramenta não carrega `.env`, não lê o banco e não consulta credenciais de outras integrações. Não precisa de Redis, Temporal ou aplicação rodando para verificar o webhook offline. `inspect` e `send-private` precisam acessar a Graph API.

1. Identificar explicitamente a Página de teste, o aplicativo, a integração e seu perfil/organização. Usar os IDs reais do ambiente de homologação; a ferramenta local não comprova vínculo com o banco. Na futura API, esses vínculos serão resolvidos e autorizados no servidor.
2. Preparar os arquivos abaixo dentro de `.secrets/`, diretório já ignorado pelo Git. Tokens entram somente nesses arquivos locais privados, nunca como argumentos do comando ou em documentação. Manter permissão `600` nos arquivos e `700` no diretório. Os exemplos são placeholders; não são credenciais válidas.
3. Executar inspeção, validar captura e revisar a mensagem antes do envio. Não usar `send-private` em comentário/conta de produção que não tenha sido destinado à prova.

`credentials.json`:

```json
{
  "pageId": "123456",
  "appId": "789012",
  "pageAccessToken": "PREENCHER_LOCALMENTE",
  "appAccessToken": "PREENCHER_LOCALMENTE",
  "appSecret": "PREENCHER_LOCALMENTE",
  "integrationId": "ID_DA_INTEGRACAO_NO_MULTIPOST",
  "organizationId": "ID_DA_ORGANIZACAO",
  "profileId": "ID_DO_PERFIL"
}
```

`webhook.json`: bytes originais do POST recebido da Meta no ambiente de teste. **Não reformatar o JSON antes de verificar a assinatura.** O parser usa o arquivo original, não um objeto JSON reserializado. `signature.txt`: somente o valor original do header `X-Hub-Signature-256`, no formato `sha256=...`. Uma captura sanitizada é útil como fixture, mas sua assinatura original não será mais válida; nos testes automatizados, assinar novamente a fixture sintética com segredo fictício.

O comando `automations:meta-proof` não instala um receptor nem muda a URL de callback. O receptor opcional `automations:meta-webhook`, descrito acima, prepara a captura HTTPS isolada; o callback do aplicativo já foi cadastrado separadamente, e a inscrição da Página continua pendente. Não reutilizar logs de produção contendo dados pessoais. A futura rota de produto `/public/fb-webhook` continua planejada, não implementada nesta etapa.

`message.json` (use um comentário novo por variante):

```json
{
  "commentId": "POSTID_COMMENTID",
  "text": "Aqui está o material: https://example.com/material"
}
```

Para testar o botão, acrescentar `"button": { "title": "Abrir material", "url": "https://example.com/material" }` e usar outro comentário. Os IDs devem ser numéricos, compostos por `_` quando aplicável; substituir o placeholder. Nenhum clique intermediário é necessário para receber a primeira mensagem.

```bash
pnpm automations:meta-proof --help
pnpm automations:meta-proof inspect .secrets/credentials.json
pnpm automations:meta-proof verify-webhook .secrets/credentials.json .secrets/webhook.json .secrets/signature.txt
pnpm automations:meta-proof send-private .secrets/credentials.json .secrets/webhook.json .secrets/signature.txt .secrets/message.json
```

`inspect` faz somente GETs. `verify-webhook` é offline. **`send-private` envia uma mensagem real**: exige comentário único presente na captura assinada, dentro da janela temporal, mensagem válida e preflight aprovado. Nunca escolhe automaticamente outro comentário. A resposta pública está preparada no adaptador e coberta por teste de contrato, mas ainda não tem comando próprio nem prova real; não considerá-la homologada pelo sucesso do envio privado.

### Resultados e recuperação

| Resultado | Significado e próximo passo |
|---|---|
| `PREFLIGHT_PASSED` | Leituras e permissões declaradas passaram. Ainda falta confirmar recebimento real e os demais cenários. |
| `BLOCKED` / `PREFLIGHT_BLOCKED` | Corrigir a integração de teste segundo `reasons`/`missingPermissions`; não modificar o token do Instagram. |
| `COMMENT_NOT_VERIFIED` | O ID não pertence a um comentário raiz elegível na captura assinada desta Página. |
| `SENT` | API retornou ID remoto. Confirmar recebimento com o participante; não prova todas as capacidades. |
| `FAILED` | Rejeição explícita da Meta; guardar categoria/code/subcode. Para uma nova prova, corrigir a causa e usar novo comentário. |
| `UNKNOWN` / `OUTCOME_UNKNOWN` / `PROOF_LEDGER_RESULT_UNKNOWN` | Pode ter havido envio. Conferir Messenger/resultado remoto; não repetir automaticamente. |
| `PROOF_ALREADY_RESERVED` | Este comentário já teve tentativa reservada neste checkout. Não remover o registro para tentar novamente. |
| `PRIVATE_FILE_REQUIRED` | Arquivo não é regular, excede o tamanho permitido ou pode ser lido por outros usuários locais. |

O ledger fica em `.secrets/meta-automation-proof-ledger/<hash>.jsonl`. A chave inclui Facebook, Página, comentário e efeito privado, independente do perfil local. Reserva com criação exclusiva impede duas execuções concorrentes; o marcador `SENDING`, seu diretório e os ancestrais são sincronizados antes do HTTP e o resultado é anexado depois. Se o filesystem não suportar essa sincronização, a ferramenta falha antes de enviar. Inclusive registros `FAILED`, `UNKNOWN` ou somente `SENDING` continuam bloqueando nova tentativa. Não contém token, texto da mensagem ou autor.

Esse ledger vale para **um checkout/máquina**, não coordena diferentes instalações, outros bots ou o motor legado. Preservar seus arquivos durante toda a homologação e não apagar reservas para contornar a unicidade. Se o registro estiver incompleto, tratar como resultado desconhecido. Na V2, o ledger será transacional no PostgreSQL, com coordenação entre automações e versões; não adaptar o arquivo local para uso distribuído.

Credenciais/capturas originais permanecem locais e privadas somente pelo tempo necessário à prova. Após registrar evidência sanitizada, remover os arquivos sensíveis seguindo a política do ambiente, preservando o ledger de tentativas. Não versionar respostas brutas, assinaturas reais, tokens, nomes de participantes ou histórico privado.

## Evidência a registrar para cada caso

Usar uma tabela sem segredos: data/hora; identificador interno do caso; versão Graph; formato do post; modo (texto/botão/público); status do preflight; HMAC aceito; resultado HTTP/categoria/code/subcode; presença de ID remoto; recebimento confirmado pelo participante; comportamento de repetição; limitações. IDs pessoais devem ser substituídos por aliases consistentes na fixture pública. Não registrar apenas “funcionou”.

| Caso | Estado atual |
|---|---|
| Contrato HTTP de texto e botão, assinatura e normalização | Testes automatizados com dados sintéticos. |
| Duplicação, falha de rede, resultado incerto e retomada local | Testes automatizados com HTTP simulado e ledger em diretório temporário real. |
| CLI em processo separado | Help, arquivo privado, parsing de captura assinada, comentário incorreto e erro sanitizado testados offline. |
| Página/app/permissões reais e recebimento Messenger | Token temporário antes validado para Página/app corretos e tarefa `MESSAGING`, agora expirado. Callback do aplicativo `page/feed` confirmado ativo; renovação, inscrição da Página, captura e recebimento Messenger pendentes. |
| Álbum/foto/Reel, replies, modos `all`/`next_publication`, repetição da pessoa | Pendente de fixtures e homologação real; nenhuma capacidade declarada como aprovada. |

## Testes e continuidade

```bash
NODE_OPTIONS=--max-old-space-size=8192 pnpm test:automations:meta --no-coverage
pnpm test:automations:regression --no-coverage
pnpm exec tsc --project tools/tsconfig.meta-proof.json
```

Os testes não chamam a Meta nem precisam de credenciais reais. As fixtures são explicitamente sintéticas. O teste do CLI executa o arquivo real em processo separado; o teste do ledger usa filesystem temporário, inclusive disputa concorrente e reconstrução da instância após resultado desconhecido.

O comando de regressão define `REDIS_URL` vazio para usar o `MockRedis` já existente no repositório, independentemente da configuração local carregada por imports legados. Isso evita abrir conexão de cache durante testes unitários e dispensa `--forceExit`. O limite de heap de 8 GiB é exclusivo desse processo de teste; não altera o runtime do produto. Não substituir futuros testes reais de integração por esse mock.

A regressão legada também inclui `database/prisma/flows`, `ig-webhook.controller`, `public.flows.controller`, providers Facebook/Instagram, messaging e resolução de host/token. A execução detalhada e os próximos passos ficam em [registro de implementação](../planning/facebook-instagram-implementation-progress.md).

## Posts agendados — confirmação de 27/10/2026

O usuário confirmou que criou agendamentos e suas automações antes de publicar; depois da publicação, comentou e recebeu as respostas tanto no Instagram DM quanto no Messenger. Evidência declarada pelo usuário, sem novo envio real executado pelo agente no incremento de seleção/paridade visual. Testes reais adicionais continuam restritos ao Escorpiano.
