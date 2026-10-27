# Automações por API e MCP

Referência dos recursos disponíveis para agentes de IA em 27/10/2026. A API e as ferramentas MCP usam a mesma fachada de domínio, com regras separadas por destino. Instagram, Facebook e Messenger mantêm seus executores, autorizações e limites próprios.

## Autenticação e identidade

Na REST, envie `Authorization: SUA_CHAVE_API` (sem `Bearer`). A chave de perfil só opera naquele perfil; pedir outro `profileId` resulta em `403 PROFILE_KEY_MISMATCH`. Uma chave de organização pode usar `?profileId=...`; omitir o parâmetro resolve **somente o perfil Default**, nunca todos os perfis. Use o ID interno do canal retornado pela descoberta, não o ID da Página na Meta.

No MCP, organização e perfil vêm exclusivamente do contexto autenticado. Não existem campos de entrada `organizationId` ou `profileId` nas ferramentas. O transporte `/mcp` aceita `Authorization: Bearer SUA_CHAVE_API`; o transporte OAuth existente também usa o contexto autenticado. Credenciais, App Secret e tokens das redes nunca fazem parte do contrato de automação.

A conta precisa pertencer ao perfil efetivo. Chave de organização sem perfil não pode criar no Default usando conta de outro perfil; a negativa ocorre antes de salvar qualquer rascunho ou executar efeitos na Meta. Use `?profileId=...` correto na REST ou chave/contexto daquele perfil no MCP. A publicação de um Reel pela ferramenta de posts é uma operação separada: não faz a automação herdar o perfil da conta. Edição rápida e reativação legadas também recusam conta incompatível com o perfil armazenado; pausar/arquivar continuam permitidos. A exceção histórica de conta org-wide sem perfil no caminho legado permanece, sem migração automática.

## Endpoints canônicos

Base: `/public/v1/automations`. O Swagger do backend (`/docs`) apresenta o contrato dos corpos. `/public/v1/flows` e `/public/v1/flows-v2` continuam disponíveis para compatibilidade; seus payloads não são intercambiáveis com os desta referência. Esta expansão atende REST e MCP; não pressupõe atualização simultânea dos wrappers SDK/CLI.

| Método | Caminho relativo à base | Uso |
|---|---|---|
| GET | `/capabilities` | Gatilhos, campos, modos, variáveis e limites reais |
| GET | `/options?resource=...` | Descoberta e prontidão |
| GET | `/` | Lista os dois motores; filtros `integrationId` e `executionVersion` opcionais |
| POST | `/` | Cria configuração declarativa; `activate=false` mantém rascunho |
| GET | `/:id?executionVersion=1\|2` | Detalhe, configuração recuperável e grafo |
| PUT | `/:id?executionVersion=1\|2` | Edição parcial em `configuration`, com controle de concorrência |
| PUT | `/:id/canvas?executionVersion=1\|2` | Substituição explícita do grafo completo |
| POST | `/:id/status?executionVersion=1\|2` | Ativar, pausar ou arquivar o mesmo ID |
| GET | `/:id/executions?executionVersion=1\|2` | Histórico sem repetir envios |
| POST | `/:id/aliases` | Aliases de comentários Instagram: listar/adicionar/remover |
| POST | `/repost` | Operações do recurso separado de repost |

`executionVersion=1` identifica Instagram legado; `2` identifica Facebook/Messenger e fluxos compartilhados V2 já existentes. Nas rotas por ID, a omissão usa `1`, sem fallback para outro motor. Nas listas, a omissão inclui ambos. Preserve o valor retornado ao continuar o trabalho.

## Descoberta antes de configurar

| `resource` | Parâmetros adicionais | Retorno/finalidade |
|---|---|---|
| `capabilities` | nenhum | Mesmo catálogo de `/capabilities` |
| `channels` | `platform` opcional | Canais do perfil com ID, nome, provider e imagem |
| `posts` | `integrationId`, `cursor` opcional | Publicações da conta/Página e cursor |
| `stories` | `integrationId` Instagram | Stories disponíveis |
| `scheduled_posts` | `integrationId`; `cursor`, `selectedId` opcionais | `posts`, `nextCursor`, seleção atual e IDs publicados quando já vinculados |
| `resolve_post` | `integrationId` Facebook, `reference` | Resolve ID/URL permanente de publicação, comprova a Página e devolve a prévia |
| `readiness` | `integrationId`, `triggerType` opcional | Prontidão da conexão; não autoriza, inscreve ou envia |

O resolvedor Facebook aceita referências que o serviço consiga comprovar como publicação da Página. Link de prévia de anúncio ou ID de vídeo não é automaticamente um ID de Page Post. Agentes não devem construir/adivinhar IDs compostos.

## Matriz de capacidades

| Recurso | IG comentário | IG resposta ao Story | Facebook comentário | Messenger mensagem |
|---|---|---|---|---|
| `triggerType` | `comment_on_post` | `story_reply` | `comment_on_post` | `messenger_message` |
| `executionVersion` na criação | 1 | 1 | 2 | 2 |
| Modos | all/specific/next_publication/scheduled | all/specific/next_publication | all/specific/next_publication/scheduled | all |
| Palavras-chave | opcionais | opcionais | opcionais | obrigatórias |
| Resposta pública/variações | sim | não | sim, inclusive sem DM | não |
| DM e botão/link | sim | sim | sim | sim |
| Follow-gate | completo | `requireFollow`/`followGateMessage` | não | não |
| Reações (`matchReactions`) | não | sim | não | não |
| Dark Post | aliases numéricos | não | resolver referência e usar `postIds` | não |
| Prioridade | não | não | não | 1–1000 |

Story do Facebook não é um gatilho com origem comprovada. Não o apresentar como tal: uma palavra-chave recebida pelo Messenger pode vir de diferentes origens. QR Code, links de referência e follow-gate no Facebook também não são oferecidos. Campos incompatíveis e campos desconhecidos são recusados, sem descarte silencioso.

## Todos os campos declarativos

`name` e `integrationId` são obrigatórios na criação. Na edição, envie apenas o que deseja mudar dentro de `configuration`. Arrays vazios removem condições/respostas quando a combinação continuar válida; aliases têm operação própria.

| Campo | Tipo/limite | Significado |
|---|---|---|
| `platform` | instagram/facebook | Padrão Instagram; Messenger pertence a Facebook |
| `name` | string não vazia, 200 | Nome da automação |
| `integrationId` | string, 64 | ID interno do canal no perfil |
| `triggerType` | enum da matriz | Padrão `comment_on_post` |
| `postMode` | all/specific/next_publication/scheduled | Padrão próxima publicação; Messenger usa all |
| `postIds` | até 100 strings, 100 cada | IDs remotos de posts específicos, incluindo Page Posts de anúncios |
| `storyIds` | até 100 strings, 64 cada | Stories específicos Instagram |
| `scheduledPostId` | string, 80 | `Post.id` interno de um único destino agendado |
| `aliasMediaIds` | até 100 IDs numéricos, 30 dígitos | Dark Posts Instagram na criação; coexistem com `postIds` |
| `keywords` | até 50 strings, 100 cada | Vazio/omitido: qualquer comentário; Messenger exige ao menos uma |
| `matchMode` | any/all/exact | Qualquer termo, todos os termos ou texto igual a algum termo |
| `matchReactions` | boolean | Incluir reações no gatilho Story Instagram |
| `priority` | inteiro 1–1000 | Messenger; padrão 10; menor número vence |
| `replyMessage` | string, 2200 | Uma resposta pública |
| `replyMessages` | até 10 strings não vazias, 2200 cada | Variações públicas; não enviar junto de `replyMessage` |
| `dmMessage` | string, 2000 | Mensagem privada/final |
| `dmButtonText` | string, IG 80/FB 20 | Texto do botão; enviar com URL e mensagem |
| `dmButtonUrl` | HTTPS público, IG 2048/FB 2000 | URL do botão; redes privadas, credenciais na URL e protocolo inseguro são recusados |
| `requireFollow` | boolean | Habilita verificação de seguidor nos fluxos Instagram suportados |
| `followGateMessage` | string, 2000 | Mensagem para quem ainda não segue |
| `openingDmMessage` | string, 2000 | Abertura do gate em comentário Instagram |
| `openingDmButtonText` | string, 80 | Botão para iniciar o gate |
| `alreadyFollowedButtonText` | string, 80 | Botão para confirmar que já segue |
| `gateExhaustedMessage` | string, 2000 | Mensagem ao esgotar tentativas |
| `maxGateAttempts` | inteiro 1–10 | Limite de tentativas do gate |
| `activate` | boolean | Criação: padrão true; false salva rascunho. Edição: omitir e usar operação de status |

Facebook com botão limita a mensagem a 640 caracteres. A criação ativa exige resposta pública ou DM; Messenger e Story precisam de DM. Rascunhos Facebook também exigem uma ação válida, pois o motor V2 valida o grafo ao salvar. `activate=false` evita a ativação, não ignora a validação dos campos.

Os motores ignoram maiúsculas/minúsculas na correspondência; não prometem equivalência entre acentos. Variações públicas representam **alternativas**, não várias respostas ao mesmo comentário. No Messenger, as regras correspondentes competem pela menor prioridade e o motor recusa empate de prioridade; deduplicação evita várias respostas ao mesmo evento. Não existe disparo em cascata de todas as regras correspondentes.

Variáveis do Instagram V1: `{commenter_name}`, `{commenter_id}`, `{comment_text}`, `{media_id}`. Facebook/Messenger V2: `{{comment_name}}`, `{{comment_text}}`, `{{comment_id}}`, `{{media_id}}`. Não converter sintaxes automaticamente. O valor disponível depende do evento recebido; não prometer nome quando a Meta não o fornece.

## Exemplos de criação

Instagram agendado com variações e follow-gate completo:

```json
{
  "platform": "instagram", "name": "Material de novembro", "integrationId": "ID_INTERNO_IG",
  "triggerType": "comment_on_post", "postMode": "scheduled", "scheduledPostId": "POST_ID_INTERNO_IG",
  "keywords": ["QUERO"], "matchMode": "any", "replyMessages": ["Te chamei no direct!", "Enviei por mensagem!"],
  "dmMessage": "Aqui está o material", "dmButtonText": "Abrir material", "dmButtonUrl": "https://example.com/material",
  "requireFollow": true, "openingDmMessage": "Toque para receber", "openingDmButtonText": "Receber",
  "followGateMessage": "Siga a conta para continuar", "alreadyFollowedButtonText": "Já sigo",
  "gateExhaustedMessage": "Confira se está seguindo e tente depois", "maxGateAttempts": 3, "activate": false
}
```

Instagram Story: use `triggerType="story_reply"`, `postMode="specific"`, `storyIds=["ID_REMOTO_STORY"]`, `matchReactions=true` e `dmMessage`. Para Dark Post Instagram sem post orgânico, use `postMode="specific"`, `postIds=[]`, `aliasMediaIds=["ID_NUMERICO"]`, `dmMessage` e/ou resposta pública. Não ampliar para `all` por faltar um post orgânico.

Facebook comentário, inclusive post de anúncio:

```json
{
  "platform": "facebook", "name": "Comentários do anúncio", "integrationId": "ID_INTERNO_FB",
  "triggerType": "comment_on_post", "postMode": "specific", "postIds": ["ID_COMPROVADO_PELO_RESOLVEDOR"],
  "keywords": ["QUERO"], "matchMode": "any", "replyMessages": ["Enviei no Messenger!", "Confira sua conversa!"],
  "dmMessage": "Aqui está o material", "dmButtonText": "Abrir", "dmButtonUrl": "https://example.com/material", "activate": false
}
```

O placeholder de `postIds` acima deve ser substituído pelo ID numérico/composto retornado por `resolve_post`. Para agendado Facebook, substitua o modo por `scheduled`, omita `postIds` e informe o `scheduledPostId` interno daquele destino Facebook.

Messenger:

```json
{
  "platform": "facebook", "name": "Preço no Messenger", "integrationId": "ID_INTERNO_FB",
  "triggerType": "messenger_message", "postMode": "all", "keywords": ["preço", "preco"],
  "matchMode": "any", "priority": 10, "dmMessage": "Veja os detalhes: https://example.com/preco", "activate": false
}
```

## Leitura, edição e ativação sem perder dados

1. Liste para verificar se a regra já existe; consulte o detalhe com o motor retornado.
2. Se `quickEditable=true`, use atualização parcial. Campos omitidos, alvos, gate e variações são preservados; labels/coordenadas existentes também são conservados. Conta, rede e gatilho não mudam nesta operação.
3. V1: copie `updatedAt` para `expectedUpdatedAt`. V2: copie `revision` para `expectedRevision`. O controle é atômico; `409 REVISION_CONFLICT` exige reler e reconciliar, sem repetir cegamente o payload antigo.
4. Se `quickEditable=false`, preserve o grafo e use a operação canvas. Nunca converter uma regra com condições, ramificações ou atrasos em configuração rápida.
5. Ative, pause ou arquive explicitamente. Ativar revalida conexão, origem e conflitos existentes. Reautorizar uma conta não exige recriar a regra.

```json
{
  "configuration": { "dmMessage": "Texto atualizado" },
  "expectedUpdatedAt": "UPDATED_AT_ISO_RETORNADO_NO_DETALHE"
}
```

No V2, troque o snapshot por `"expectedRevision": 4`. Status usa `{"status":"ACTIVE","expectedRevision":4}` em V2, com a revisão atual. V1 também aceita DRAFT; V2 aceita ACTIVE/PAUSED/ARCHIVED. Editar uma regra ativa conserva seu estado, segue a política existente de invalidar a revisão pendente anterior e mantém o ID/histórico.

Se uma criação já gravou a regra e falhar numa etapa posterior, a resposta informa `saved=true`, `id`, `executionVersion` e `activationError` com código sanitizado. Consulte/repare/ative **esse ID**. A criação não é idempotente por nome: repetir POST/create depois de perder a resposta pode criar outra regra. Liste e confira antes de tentar novamente.

## Grafo e aliases

O detalhe V1 retorna `canvas`; V2 retorna `definition` e `channels`. Na REST, a gravação explícita usa `nodes` e `edges` na raiz do corpo, snapshot obrigatório e `name` opcional não vazio. No MCP, esses campos ficam dentro de `canvas`, junto de `flowId`/`executionVersion` na raiz da ferramenta. `channels` só existe para V2; omitir preserva os atuais. Um V2 antigo com dois canais permanece editável por grafo; a criação declarativa nova mantém uma regra por destino.

Cada nó tem `id`, `type`, `data` (**string JSON**), `positionX`, `positionY` e `label` opcional. Arestas têm `sourceNodeId`, `targetNodeId`, `id` e `sourceHandle` opcionais. Não enviar opcionais como null. Campos de `data` permitidos:

| Nó | Campos |
|---|---|
| TRIGGER | triggerType, keywords, matchMode; priority só Messenger. V1 também mode, postIds, storyIds, scheduledPostId e campos Instagram do gate/reações |
| CONDITION | keywords, matchMode |
| REPLY_COMMENT | message, messages |
| SEND_DM | message, buttonText, buttonUrl |
| DELAY | duration inteiro 0–86400, unit seconds/minutes/hours |

`sourceHandle="match"`/`"no_match"` só em condição. Um gatilho, sem ciclos, nós conectados e ações compatíveis com o canal. V1: até 100 nós/200 arestas/128 KiB; V2: 30 nós/60 arestas/64 KiB. Limites de mensagem e URLs continuam aplicáveis. Campos fora da lista são recusados.

Aliases usam `{"operation":"list"}`, `{"operation":"add","aliasMediaId":"123456"}` ou `{"operation":"remove","aliasId":"ID_RETORNADO_NA_LISTA"}`. Adicionar é exclusivo de comentários Instagram; Story não aceita alias. Remoção verifica se o alias pertence àquela regra/perfil. Não enviar outro array de aliases na edição declarativa para substituir os existentes.

## Posts agendados e próxima publicação

Agende primeiro pelos recursos existentes de posts. Use o `Post.id` de cada destino em `scheduledPostId`, nunca o ID do grupo nem o ID remoto da Meta. Para 30 posts em duas redes, crie 60 vínculos exatos, um por destino. O vínculo persiste após publicar; não mude para `next_publication` depois. Recorrentes não são suportados neste modo.

Para consultar, editar conteúdo ou reagendar esse destino sem recriar o ID, use [Gerenciamento de posts e agendamentos por API/MCP](posts-agent-api.md). O detalhe fornece `version`, exigida como `expectedVersion` na alteração; os vínculos e IDs remotos já congelados da automação permanecem preservados.

“Próxima publicação” continua reservado ao próximo post sem alvo exato; não deve consumir um post reservado por automação agendada ativa. Consulte os detalhes de recuperação e deduplicação em [Posts agendados](../operations/automacoes-posts-agendados.md). No painel, a etiqueta Agendado desaparece ao publicar, sem etiqueta substituta.

## Repost: recurso separado

`POST /repost` e `manageRepostAutomationTool` recebem `operation` e campos conforme a ação. Consultas: sources, destinations, list, get, history. Escritas: create, update, toggle, archive. `run_now` executa a regra; `reset_checkpoint` altera o ponto de coleta. Essas duas ações não são diagnóstico nem validação: exigem intenção explícita do usuário.

`get`, `update`, `toggle`, `archive`, `history`, `run_now`, `reset_checkpoint` usam `ruleId`. `toggle` exige `enabled`; `destinations` aceita `sourceType`; `history` aceita page/limit (1–100). create/update usam `configuration`:

| Campo | Tipo/limite |
|---|---|
| name | string, 120; obrigatório na criação |
| sourceIntegrationId | ID interno; obrigatório na criação |
| sourceType | INSTAGRAM_STORY/INSTAGRAM_POST; obrigatório na criação |
| destinations | 1–50 objetos `{integrationId, format}`; obrigatório na criação |
| intervalMinutes | inteiro 5–360 |
| filterIncludeVideos / filterIncludeImages | boolean |
| filterMaxDurationSeconds | inteiro 1–900 ou null |
| filterHashtag | string 100 ou null |
| captionTemplate | string 2200 ou null |
| enabled | boolean; use false para preparar sem iniciar |

Formatos de destino: INSTAGRAM_POST, INSTAGRAM_STORY, FACEBOOK_REEL, FACEBOOK_STORY, TIKTOK_FEED, YOUTUBE_SHORT, LINKEDIN_POST, X_POST, THREADS_POST, PINTEREST_PIN. A combinação depende do provider e dos candidatos retornados; não supor elegibilidade só por constar no enum. Atualização é parcial e reutiliza as validações do domínio de repost. Não confundir esse recurso de publicação com resposta a Story.

## Ferramentas MCP

| Ferramenta | Uso |
|---|---|
| getAutomationOptionsTool | capabilities, canais, posts, Stories, agendados, resolver ID e prontidão |
| createCommentAutomationTool | Todos os campos declarativos desta referência |
| listCommentAutomationsTool | Ambos os motores por padrão, filtro de integração opcional |
| getCommentAutomationTool | Configuração, grafo e snapshot |
| updateCommentAutomationTool | Patch seguro, sem recriar nem mudar estado |
| setCommentAutomationStatusTool | Ativar/pausar/arquivar, com revisão V2 |
| getAutomationHistoryTool | Resultados sem reexecutar; V1 paginado, V2 histórico recente limitado a 100 |
| manageAutomationAliasesTool | Aliases de comentários Instagram |
| saveAutomationCanvasTool | Grafo explícito e completo |
| manageRepostAutomationTool | Contrato separado de repost |

As ferramentas por regra usam `flowId` e `executionVersion`. Todos os schemas têm raiz objeto e tipos concretos. Erros são códigos controlados, sem resposta bruta de credenciais/Meta. Os passos recomendados são descoberta → consulta existente → criação/patch → revisão → ativação autorizada → histórico.

## Validação desta entrega

Testes automatizados cobrem campos, HTTP/Swagger, schemas MCP, perfil, preservação do gate/variantes, grafo, rascunho, atualização concorrente e reservas de posts em PostgreSQL isolado. A atualização local usa a imagem Docker existente. Esta revisão não publica posts nem envia mensagens reais; provas futuras na Meta continuam limitadas ao Escorpiano.
