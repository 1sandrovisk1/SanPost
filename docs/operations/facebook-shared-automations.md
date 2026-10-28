# Automações de comentários — Facebook e Instagram

Em 27/10/2026, a [API e o MCP para agentes](../api/automations-agent-api.md) passaram a expor o contrato completo por gatilho: comentários Instagram/Facebook, Stories Instagram, Messenger, agendados, variações, gate, grafo e histórico. A fachada `/public/v1/automations` preserva os endpoints legados e exige controle de concorrência na edição.

Atualizado em 26/10/2026: **Nova Automação** abre um único seletor, com abas Instagram/Facebook e os gatilhos disponíveis. Escolher o gatilho abre o editor, sem criar um registro vazio. Nome (com sugestão inicial) e conta são definidos uma única vez no editor. O motor V2 mantém compatibilidade com automações compartilhadas já salvas; novas criações pelo painel são separadas.

Os editores reaproveitam a seleção de conta e a moldura da prévia. No Facebook há uma Página por automação; trocar a seleção limpa os posts da Página anterior. Em regras antigas com duas redes, o outro canal é preservado. **Alterar a seleção não desconecta a conta do MultiPost.**

Em 27/10/2026, o [ambiente padronizou respostas, prévia e barra comum](editor-rapido-automacoes.md). Instagram e Facebook têm nome, **Salvar** e toggle para ativar/pausar na barra superior comum, com as abas Editor rápido, Construtor visual e Histórico. Sem alterações, Salvar permanece desabilitado. Para adicionar Dark Post IDs antes de ativar no Instagram, abra a seção de IDs e use **Preparar rascunho para Dark Posts**, com nome/conta/conexão válidos. Isso salva um rascunho e fixa a conta; após incluir IDs, salvar/ativar usa esse mesmo registro. Repost continua em seu editor próprio.

## Mensagens do Messenger por palavra-chave

No seletor **Nova Automação → Facebook**, escolha **Mensagem recebida no Messenger**, selecione a Página e informe palavras-chave, modo de correspondência e resposta. A prioridade fica em **Configurações avançadas**. A tela não pede publicação nem oferece resposta pública. Editor rápido e construtor visual usam os mesmos campos.

Para esse gatilho, assine `messages` no webhook do aplicativo Meta, mantendo `feed` se usa comentários. O MultiPost verifica a configuração sem alterá-la. Se faltar a assinatura da Página, aparece **Ativar recebimento do Messenger**; essa ação preserva os campos existentes e afeta somente a Página selecionada. A autorização pode vir do login ou do usuário de sistema já configurado.

A prioridade vai de **1 a 1000; o menor número vence**. Regras idênticas ou prioridades repetidas na mesma Página são recusadas ao ativar. Se duas regras diferentes corresponderem à mensagem, apenas a vencedora executa; as outras aparecem no histórico como **Ignorada por conflito**. Uma condição que interrompe a vencedora não transfere a mensagem à próxima regra. Uma nova mensagem é um novo evento e pode executar novamente.

O envio ocorre ao autor da mensagem, dentro da janela de **24 horas**, inclusive após esperas. Reentregas do webhook ou retomadas do worker não enviam de novo; resultado incerto não é reenviado automaticamente. Respostas de Story que chegam como mensagens comuns podem corresponder às palavras-chave, mas não há seleção exclusiva de Story. QR Code e links de referência não fazem parte deste incremento.

Prova real em 26/10/2026, somente no Escorpiano: a mesma mensagem correspondeu a duas regras (prioridades 10 e 20). Apenas a prioridade 10 enviou; a outra registrou `SKIPPED_CONFLICT`, sem entrega. O usuário confirmou uma única resposta com o link.

O recurso está na API autenticada V2 e, desde 27/10/2026, na fachada pública `/public/v1/automations` e nas ferramentas MCP atualizadas. `/public/v1/flows` continua específico do motor V1; use a referência canônica para Messenger. Detalhes e validações do motor em [Messenger por palavra-chave](../planning/facebook-messenger-keywords.md).

## Jornada do usuário — comentários

### Publicações de anúncios (Dark Posts)

No Facebook, escolha **Selecionar publicações** e expanda **Dark Post ou publicação por ID**. Cole o ID da publicação do anúncio (por exemplo, `123_456`) ou seu link permanente com ID numérico e clique em **Localizar publicação**. Após conferir a prévia, clique em **Adicionar à seleção**, salve e ative a automação. A consulta não cria anúncios nem envia mensagens.

Para uma prova com publicação nova, o Gerenciador observado em 26/10/2026 oferece **Usar post existente → Criativo do anúncio → Criar post → Salvar post não publicado**. Use um novo anúncio em rascunho e confira a identidade da Página antes de salvar. O ID aparece no cartão **Post do Facebook**; copiar o número do anúncio/campanha ou o link `fb.me/adspreview` não substitui esse ID. Na prova do Escorpiano, a busca no MultiPost devolveu o permalink do post recém-salvo, que abriu com caixa de comentário mesmo sem publicar o anúncio. O envio de prévia para iOS não foi necessário: o usuário comentou pelo link e confirmou uma resposta privada. Isso comprova as contas/formato testados, não acesso universal ou veiculação paga.

No Gerenciador de Anúncios, procure a publicação com comentários na prévia do anúncio. Use o ID da **publicação**, não o ID do anúncio, conjunto ou campanha. Para quem integra via Marketing API, o criativo informa esse vínculo em `effective_object_story_id`. Links curtos `share` e identificadores `pfbid` não são resolvidos: use o ID numérico. A consulta confirma a propriedade da Página, mas não identifica se a publicação é um anúncio ou post orgânico.

A seleção é preservada mesmo quando a publicação não aparece no feed. Abra o resumo das publicações selecionadas para remover um ID. O limite é de 100 por canal, incluindo a seleção na grade; o editor rápido permite salvar alterações de uma regra ativa com o impacto informado na barra superior. O construtor visual mantém seu bloqueio durante a ativação. As mesmas opções de seleção aparecem nos dois editores.

O recebimento usa o webhook `feed` existente e o ID completo da publicação, sem outro callback. Após ativar, faça um **comentário novo de primeiro nível** e confira o histórico. Formatos que a Meta não disponibiliza como Page Post, inclusive determinados anúncios/Reels, não estão garantidos. A regra atual exige `parent_id === post_id`; não trata respostas a comentários nem IDs alternativos de foto/vídeo como equivalentes automaticamente. Em 26/10 às 18:27, a nova publicação não publicada do Escorpiano passou pela prova completa: busca por ID, seleção, ativação, comentário `DARK26`, execução concluída e uma resposta privada recebida. A regra de teste foi pausada, com histórico preservado. Homologação limitada ao formato testado (Page Post com imagem). [Contrato e validações](../planning/facebook-dark-posts.md).

**Reel publicado usado em anúncio:** uma segunda prova, em 26/10 às 20:13, confirmou o comentário `Video26` e uma única resposta privada recebida no Messenger. Nesse caso, o ID do **post** fornecido pelo anúncio foi reconhecido pela consulta existente, que devolveu o link do Reel, e a publicação também apareceu na lista normal. Selecione o post na lista ou use o ID da publicação; desde a correção de 28/10, ID de vídeo e URL `/reel/…` também são aceitos na localização, quando a Meta comprova `Video.post_id` e a propriedade do vídeo e da publicação. O ID salvo continua sendo o do Page Post, usado pelo webhook. O teste não exigiu outro webhook nem alteração do executor. A regra temporária está pausada.

**Vídeo novo não publicado:** prova em 28/10/2026 no Escorpiano confirmou `is_published=false` antes e depois do comentário `VIDEODARK28`, uma execução e uma DM com botão recebida uma única vez. Criado pela API da Página com `published=false` e `unpublished_content_type=ADS_POST`, sem campanha/anúncio ativado; ID do Page Post obtido do `post_id` retornado pela Meta, distinto do ID de vídeo. O comentário foi feito pelo perfil pessoal com acesso de gerenciamento à Página; outra conta não conseguiu abrir o permalink, portanto não houve prova de visibilidade externa ou veiculação paga. No Gerenciador, anexar vídeo abriu outro compositor com **Publicar agora** marcado; **Salvar como rascunho** gerou rascunho editorial em vez de Page Post consultável pela integração. Regras temporárias pausadas. [Roteiro, IDs e evidências](prova-agentes-dark-video-20261028.md).

### Configuração e ativação

1. No perfil desejado, conecte a Página Facebook. Em **Configurações → Credenciais → Facebook**, autorize automações pelo login Meta. O MultiPost obtém e guarda o token; não é necessário gerar um token de uma hora ou colá-lo no site.
2. Configure o webhook do aplicativo **uma vez**, conforme [onboarding](facebook-automation-panel.md). Depois, autorize e ative o recebimento de cada Página pelo MultiPost. Várias Páginas podem usar o mesmo App ID. O sistema não inscreve todas as Páginas acessíveis ao login.
3. Em **Automações → Nova automação**, escolha a aba **Facebook** e o gatilho **Comentário em publicação**. No editor, selecione uma Página do perfil atual. A aba **Instagram** oferece comentários, respostas a Stories e repost, cada um com os recursos próprios.
4. Selecione as publicações da Página. As opções são posts específicos, todos os posts e próxima publicação. “Próxima publicação” não associa individualmente vários agendamentos; esse vínculo está no [plano de agendamentos](../planning/automacoes-meta-compatibilidade-e-agendamentos-20261026.md).
5. Escreva a mensagem privada, incluindo o link no próprio texto. Palavras-chave vazias respondem a qualquer comentário elegível. Para responder também no comentário, habilite a resposta pública e use **Adicionar variação** se desejar alternativas. A prévia usa a mesma apresentação do wizard Instagram e mostra apenas a mensagem configurada, sem inventar uma continuação. O botão com link HTTPS está disponível no editor simples; condições e esperas ficam no construtor visual.
6. Use **Salvar** para configurar sem ativar, ou ligue o toggle da barra superior para salvar e ativar. O editor rápido permite editar uma regra ativa e informa na barra superior o impacto de salvar. Conexão verificada não significa automação ativa. Após ativar, faça um **comentário novo** com outra conta no post escolhido. Não é preciso voltar ao botão de verificar recebimento.
7. Abra **Histórico** para conferir a execução e cada envio. `SENT` é confirmação da API; o recebimento na caixa do destinatário é uma verificação adicional. `UNKNOWN` significa resultado incerto: não há reenvio automático, pois a Meta pode ter recebido a mensagem.

As automações existentes aparecem na mesma tabela, mantendo seus editores, redes e contratos originais. A escolha **Instagram** abre diretamente o fluxo com pedido para seguir, variações e demais opções existentes. Para impedir duas respostas ao mesmo comentário, a ativação V2 exige que não haja automação V1 de comentários ativa nem execução V1 pendente na mesma conta. Stories legados continuam independentes. Esse bloqueio também deve ser considerado ao retomar o Instagram antigo numa conta com V2 já ativo. O produto não converte flows antigos automaticamente.

## Interface revisada em 26/10/2026

- **Entrada e lista:** um modal com abas Instagram/Facebook e cartões de gatilhos. Alternar a aba não grava dados; clicar no gatilho abre diretamente seu editor. Facebook novo mostra somente Páginas; o link de Credenciais pode preencher uma Página, mas não uma conta Instagram. Edições V2 mantêm as plataformas salvas, inclusive canais indisponíveis que precisam de reparo. V1/V2 usam a mesma tabela. Arquivar V2 preserva o histórico e exige confirmação; conflitos de revisão pedem atualização. Erro de uma fonte não oculta a outra.
- **Criador:** gatilho e conta → origem, quando aplicável → condições → resposta. Seleção de conta e moldura de prévia são compartilhadas; os motores e ações de salvamento continuam específicos de cada rede. Prévia à direita no modo rápido; nome, Salvar e ativação/pausa na barra comum aos três modos. A configuração da conexão abre em outra aba, mantendo o rascunho; o Instagram abre sua seção, e o Facebook sua Página selecionada.
- **Publicações:** miniatura, legenda, data e link; seleção e IDs em detalhes. Há estados separados de carregamento, vazio e falha. Seleções de outras páginas de resultados são mantidas.
- **Construtor visual:** gatilho identifica plataformas e seleção real de cada canal sem alterar o grafo persistido. Resposta pública e mensagem privada têm rótulos próprios. A roda do mouse continua rolando a página; zoom pelos controles. Fluxos ativos podem ser inspecionados, mas seus campos permanecem bloqueados.
- **Validação e histórico:** erros aparecem antes do salvamento com acesso à etapa inválida. A aba Histórico consulta as execuções com filtros e paginação no servidor a cada cinco segundos apenas enquanto montada e visível. Erros recebem orientações controladas, sem expor respostas brutas da Meta; `UNKNOWN` não oferece reenvio.
- **Conexão saudável:** resumo compacto. Prazos e condições de revogação continuam disponíveis em detalhes; ocultar esses detalhes não altera validade nem renovação.

## Limites do primeiro incremento

### Variações de resposta pública

No formulário rápido e no nó de resposta pública do construtor visual, cadastre de uma a dez alternativas, com até 2.200 caracteres cada. Preencha ou remova entradas vazias antes de salvar. O botão **×** remove apenas a alternativa correspondente; desabilitar **Também responder no comentário** remove a resposta pública inteira. A mensagem privada continua independente.

O MultiPost escolhe aleatoriamente **uma** alternativa por nó de resposta pública e comentário elegível. Pode repetir o texto em comentários consecutivos; não é rodízio, nem garantia de prevenção de bloqueios. O seletor **Variação exibida na prévia** permite visualizar cada texto e não determina qual será enviado.

A seleção acontece na ingestão do evento. O texto final, já com variáveis substituídas, é salvo na execução; retomadas usam o mesmo texto. Webhooks duplicados não criam nova execução. Reservas de envio e tratamento de resultado incerto permanecem iguais.

Contrato existente: `REPLY_COMMENT.data` aceita `{ "message": "Resposta única" }` ou `{ "messages": ["Resposta A", "Resposta B"] }`. Quando ambos existem, a lista tem precedência. A correção vale para o motor V2, inclusive fluxos Instagram/mistos já salvos com listas; o Instagram V1 não muda. Snapshots anteriores continuam com a resposta já escolhida. Sem migração de dados e sem nova API pública/MCP neste incremento.

### Comparação dos editores em 26/10/2026

O editor V2 continua editando as redes presentes nos fluxos salvos; novos fluxos V2 pelo painel usam apenas Facebook. Um Instagram V2 existente não é convertido no editor antigo. A edição rápida mantém formulário lateral e prévia maior à direita, preservando canais, campos, ações, revisão e histórico.

| Recurso | Instagram antigo | Criador compartilhado |
| --- | --- | --- |
| Posts específicos, todos ou próxima publicação | Sim | Sim, separadamente por canal |
| Palavras-chave, mensagem privada e botão com link | Sim | Sim, mensagem/regra compartilhada |
| Resposta pública | Sim | Sim, única ou com alternativas |
| Variações da resposta pública | Sim | Sim, até dez alternativas, uma escolha por comentário/nó, preservada na execução |
| Pedir para seguir antes de liberar link | Sim, fluxo próprio do Instagram | Não portado; sem equivalente Facebook implementado/homologado |
| IDs alternativos de Dark Posts e inbox de comentários não vinculados | Sim | Não portados; seleção manual de ID não equivale ao mecanismo de aliases |
| Continuidade com postbacks/seguimento da conversa | Sim | Não; uma resposta final por comentário ou mensagem recebida |
| Stories | Editor específico do Instagram | Sem seleção de Story; respostas recebidas como DM comum podem corresponder ao gatilho Messenger |
| Condições e espera | Construtor visual | Construtor visual |

Dark Posts do Facebook podem ser selecionados por ID/link numérico, com prova real concluída para Page Post com imagem salva como não publicada, Reel publicado usado em anúncio e vídeo novo não publicado consultável como Page Post. No último caso, o teste usou um perfil pessoal com acesso à Página; visibilidade externa não foi comprovada. O mecanismo de aliases e inbox do Instagram continua específico desse canal. Variações públicas já estão disponíveis. A entrada **Instagram** oferece o editor antigo. Não reative os dois motores de comentários na mesma conta; pause o anterior e aguarde execuções pendentes. Recursos exclusivos por canal precisam de modelagem explícita, sem prometer condição de seguidor no Facebook nem descartá-la silenciosamente no Instagram.

Um vídeo publicado nas duas redes resulta em duas publicações com IDs distintos. A jornada atual cria uma automação para cada rede. Fluxos compartilhados anteriores continuam editáveis e não perdem canais ao salvar. A API interna V2 mantém seu contrato; não foi criada uma API pública nova neste ajuste de interface.

### Execução dos comentários

- Apenas comentários novos de feed. Facebook ignora edições, comentários da própria Página e respostas a outros comentários.
- Um texto privado final por comentário; nós de DM consecutivos são agregados. Uma espera ou resposta pública entre duas DMs é recusada. A janela verificada é de sete dias, com elegibilidade conferida novamente antes do envio Facebook.
- Texto privado até 2.000 caracteres; template com botão até 640, título até 20. Resposta pública até 2.200. Valores interpolados também são validados antes do envio.
- Até 30 nós, 60 arestas, 50 palavras-chave por condição e 24 horas de espera acumulada. Ciclos, nós desconectados e opções não suportadas são recusados.
- Stories, follow-gate e postback permanecem exclusivos do editor Instagram V1. Não são removidos silenciosamente ao editar uma definição compartilhada.
- Próxima publicação feita pelo MultiPost pode ser vinculada pelo resultado da publicação. Para publicação externa, o vínculo ocorre no primeiro comentário elegível observado após a ativação; não é uma busca retroativa pelo post cronologicamente mais recente.
- A API da mudança inicial do editor era a API autenticada do painel. O contrato público e MCP completo foi entregue em 27/10/2026; isso não implica atualização dos wrappers SDK/CLI nem conversão automática de V1.

## Tokens e reautorização

O OAuth de automações troca o código por autorização de longa duração e obtém o token da Página. A credencial é cifrada e separada do token usado para publicar. Um Page token não possui o fluxo convencional de `refresh_token`; não prometemos renovação permanente.

O painel consulta a Meta e mostra separadamente o vencimento do token e o prazo de acesso aos dados. `expires_at=0` indica que a Meta não informou vencimento programado para aquele token. Revogação de permissão, alteração de acesso à Página, segurança da conta ou mudança do aplicativo podem invalidá-lo antes. Quando necessário, use **Autorizar pelo Facebook Login** e conclua o login; não é preciso copiar um novo access token nesse caminho. Para autorização por usuário de sistema, confira o token cadastrado e use **Reaplicar usuário de sistema**.

Na consulta somente leitura de 22/10/2026 para Escorpião Veneno, o token era válido, tipo `PAGE`, sem vencimento programado (`expires_at=0`), com acesso aos dados até **19/01/2027 21:18:20 America/Sao_Paulo**. Esse é um retrato daquela consulta, não garantia de permanência. O cron de publicação não renova essa autorização separada. A configuração e o pré-envio revalidam a credencial; não há monitor global novo de todas as Páginas neste incremento.

No Instagram, a rota canônica existente continua selecionando Instagram Login, override de messaging ou Facebook Login. A configuração manual antiga pode continuar sendo usada. Não foi feita migração de credenciais Instagram nem alteração de seus webhooks como parte desta homologação.

Em 26/10/2026, a gravação do lazy refresh passou a ser condicional: após a resposta da Meta, relê a credencial do perfil exato, compara o token e a data de renovação originais, preserva as demais entradas atuais e grava apenas se o ciphertext não tiver mudado. Remoção/rotação concorrente não é desfeita. Conflito interrompe o resolver com `AUTHORIZATION_CHANGED`, sem trocar silenciosamente para o Page token.

## Contrato técnico e manutenção

API `/flows-v2`, autenticada pela sessão e pelo perfil ativo:

| Método e caminho | Função |
|---|---|
| GET /flows-v2 | Lista somente V2 do perfil. |
| POST /flows-v2 | Cria rascunho com name, channels e definition. |
| GET/PUT /flows-v2/:id | Consulta ou edita; PUT exige expectedRevision. Edição ativa revalida conexão/conflitos e invalida a revisão pendente anterior. |
| POST /flows-v2/:id/status | ACTIVE/PAUSED com expectedRevision. |
| DELETE /flows-v2/:id | Arquiva com expectedRevision; mantém histórico/ledger. |
| GET /flows-v2/:id/executions | Últimas 100 execuções e entregas, sem tokens. |
| GET /flows-v2/channels | Canais conectados do perfil. |
| GET /flows-v2/channels/:id/posts | Lista paginada com cursor validado, sem seguir URL remota arbitrária. |
| GET /flows-v2/channels/:id/readiness | Diagnóstico e validade; Facebook somente leitura, Instagram pode usar renovação existente. |

Cada canal informa `integrationId`, `postMode` (`specific`, `all`, `next_publication`, `scheduled`) e `postIds`; o modo agendado usa `scheduledPostId` interno. A definição canônica contém nodes/edges, compatível com os componentes visuais existentes. IDs remotos e plataforma são resolvidos pelo servidor. Revisão obsoleta retorna 409. Outro perfil não pode ler/alterar o flow. `/flows` V1 não lista/edita V2; a fachada `/automations` identifica os dois por `executionVersion`.

Persistência: Flow versão/revisão/definition, FlowChannel, AutomationEvent, AutomationDispatch, FlowExecutionV2 e FlowDelivery. Evento, snapshot e despacho são gravados atomicamente. Workflows usam IDs determinísticos; o dispatcher reconciliado no boot recupera eventos após indisponibilidade do Temporal. Credenciais nunca vão para argumentos/histórico do workflow. O envio faz preflight e reserva durável antes do único POST. Falha incerta mantém bloqueio contra reenvio.

O efeito privado é reservado por plataforma + conta remota + comentário, inclusive entre flows/perfis V2. O bloqueio V1/V2 e a admissão legada usam o mesmo lock de conta. Pausa/edição invalida execuções antigas por revisão; um POST já em andamento não pode ser desfeito.

## Implantação local e rollback

A migração `20261022_shared_comment_automations/migration.sql` é aditiva e obrigatória antes de executar o binário novo, mesmo com V2 desabilitado: consultas V1 já usam executionVersion e a admissão compartilhada. Faça backup antes; não execute `db push --accept-data-loss` no banco recuperado. Atualize backend e orchestrator juntos, gere o Prisma Client para o sistema do container e só então habilite `SHARED_AUTOMATIONS_ENABLED=true`. O padrão do exemplo é false.

Até 26/10/2026, o overlay restringia canais ao Escorpiano. A pedido do usuário, `docker-compose.meta-proof.yaml` agora define `SHARED_AUTOMATION_TEST_INTEGRATION=''`: ativação, ingestão e envio usam controles normais por organização/perfil/conta. A variável opcional continua disponível para homologações restritas futuras. `RUN_CRON` permanece vazio; nenhuma renovação/publicação global é ativada. A prova manual mantém seu escopo próprio.

Para desenvolver com atualização automática do frontend e sem novas imagens, use **`pnpm dev:local`**, conforme [guia de desenvolvimento](multipost-local-development.md). O comando abaixo sem o quinto overlay executa os fontes da imagem, não as alterações atuais do checkout.

Para subir os serviços já preparados:

```bash
docker compose --env-file .secrets/multipost-local.env \
  -f docker-compose.local.yaml -f docker-compose.tunnel.yaml \
  -f docker-compose.restored.yaml -f docker-compose.meta-proof.yaml \
  up -d --no-build
```

O túnel Cloudflare continua sendo o serviço já instalado no Mac, conforme [guia local](multipost-local-docker.md). O comando acima não reconstrói código nem substitui a configuração do túnel.

Rollback: desabilite V2 em backend/worker, pause/cancele os workflows V2 e volte à imagem anterior. Mantenha tabelas e ledgers. Não reative V1 sobre comentários com efeito V2 pendente/incerto. Não apague o banco recuperado nem os volumes.

## Validação reproduzível

Na separação inicial de 26/10/2026, a suíte de interface passou com **140 testes / 18 arquivos**, e o TypeScript do frontend passou. A navegação autenticada confirmou os dois cartões, o modal original do Instagram, o retorno à escolha e o formulário Facebook sem contas Instagram. Console sem erros/avisos capturados. Essa validação não salvou/ativou fluxos nem enviou mensagens reais e não exigiu rebuild Docker. As provas de envio anteriores estão registradas abaixo; não confundir a revisão de interface com nova homologação da Meta.

```bash
pnpm test:automations:regression
pnpm exec vitest run --config tools/vitest.facebook-panel.config.mts
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec jest --config tools/jest.shared-workflows.config.ts --runInBand
pnpm build:backend
pnpm build:orchestrator
NODE_OPTIONS=--max-old-space-size=8192 pnpm exec tsc -p apps/frontend/tsconfig.json --noEmit --incremental false
```

O teste `shared-flows.database.spec.ts` exige `SHARED_FLOW_TEST_DATABASE_URL` apontando a um banco cujo nome começa com `multipost_shared_test_`, com schema atualizado e sem dados reais. Sem essa variável ele é explicitamente pulado. Na homologação foi executado em PostgreSQL 17 Docker separado do banco recuperado; cobre concorrência, deduplicação, pausa, revisão, próximo post e bloqueio V1. Todas as chamadas à Meta dos testes automatizados são simuladas; testes HTTP também exercitam o Nest real em localhost.

Prova real V2: somente a Página `271852286004401`, post `271852286004401_122321127302221279`, mensagem aprovada com o link do próprio post. O comentário da prova manual já recebeu sua resposta privada e não pode ser reutilizado. Registrar separadamente envio aceito, estado persistido e confirmação do destinatário.

## Resultado da homologação de 22/10/2026

A automação `c653c56a-3426-41d2-8ce5-29b3cb86df47`, criada e ativada pelo painel somente no post de teste do Escorpião, recebeu um comentário novo às 18:03:23 e concluiu a execução às 18:03:27 (America/Sao_Paulo). Banco, Temporal e histórico concordam: execução `COMPLETED`, entrega privada `SENT` e aceite da Meta. Em 22/10/2026, o usuário confirmou o recebimento da nova mensagem com o link no Messenger, concluindo a prova automática de ponta a ponta. Evidências no [handoff](../planning/facebook-shared-creator-handoff-20261022.md). Nenhuma outra Página ou Instagram participou da prova real.

Em 25/10/2026, a mesma automação recebeu uma nova prova após a troca pelo painel
para autorização por **usuário de sistema**. O comentário chegou às 19:17:47 e a
mensagem foi aceita pela Meta às 19:17:55, com recebimento confirmado pelo usuário.
Fluxo, canal e histórico anterior foram preservados; uma execução e uma entrega
novas foram registradas. Evidências no [guia de usuário de sistema](facebook-system-user-authorization.md).

## Histórico padronizado

A aba Histórico usa a mesma tabela e drawer do Instagram, com filtros por situação/período, paginação, data pt-BR e resultados de entrega registrados. Consulte [histórico e detalhes](historico-execucoes-automacoes.md) para interpretação de aceite da Meta, resultado desconhecido e contrato autenticado. A consulta preserva o rascunho e não oferece reenvio automático.

## Correção de identidade e miniaturas de Dark Posts de vídeo (28/10/2026)

A Meta pode aceitar `Página_IDdoVídeo` em uma consulta de metadados e devolver esse mesmo ID, embora o webhook `feed` use outro Page Post. Por isso, comparar apenas o ID retornado e `from.id` não prova o alvo correto. O resolvedor agora identifica o vídeo pela anexação/permalink, consulta `Video.post_id` e confirma a Página, o ID e a relação do Page Post final. Não há consulta de anúncios, fetch da URL fornecida, novo callback ou alias no executor. Sem relação comprovada, a consulta falha com orientação; referências incorretas são recusadas ao ativar ou editar regra ativa (`POST_REFERENCE_NOT_CANONICAL`). Rascunhos continuam podendo ser salvos durante reconexão. A validação de ativação usa o mesmo helper interno sem consumir o orçamento reservado ao endpoint de localização.

O editor recupera metadados dos IDs Facebook selecionados que não aparecem em `published_posts`; conservar a prévia ao adicionar também evita seu desaparecimento imediato. A recuperação é apenas visual: não muda IDs ou regras. São até cinco consultas automáticas por carregamento, duas simultâneas, cache separado por usuário/perfil/Página/seleção e sem retry automático. O usuário pode carregar os próximos cinco ou tentar novamente os que falharam; o orçamento existente de 20 localizações por aplicativo/Página/minuto continua valendo. IDs com falha ou referência diferente permanecem visíveis, com orientação de remover/localizar novamente. Não há migração em massa nem reprocessamento de comentários anteriores.

Diagnóstico do caso: a automação `3c65ded3-741a-436a-8d42-f8641e0506d1` guardou `271852286004401_1651363283147505`, mas os comentários recebidos às 09h40 e 09h41 de 28/10 apontaram para `271852286004401_122322703694221279`. Vídeo e Page Post pertencem ao Escorpiano; `is_published=false`. Após corrigir apenas essa seleção com revisão esperada, o comentário novo `DARKFIX28` gerou uma execução concluída às 10h42 (Brasília), uma resposta pública e uma DM aceitas pela Meta; o responsável confirmou o recebimento. REST e MCP coincidiram. A regra do usuário continua ativa, com respostas preservadas. Evidências no [plano do incidente](../planning/facebook-dark-post-identity-20261028.md), sem reenviar os comentários antigos.


### Seleção combinada e identificação visual

**Publicações específicas** combina publicações normais e vários Dark Posts na mesma automação. A localização por ID/link fica dentro desse card; não é um quarto modo de execução. A badge **Dark Post** aparece apenas quando a Meta confirma que o Page Post não está publicado. **Por ID** indica metadados recuperados nessa edição sem confirmação de não publicado; ausência na galeria não prova um Dark Post. Posts normais não recebem badge “Publicado”. A identificação é visual e não altera o alvo, nem comprova anúncio pago. Metadados publicados mais recentes prevalecem sobre uma prévia recuperada.

Trocar para **Qualquer publicação** ou **Próxima publicação** limpa os IDs do payload, como antes. Voltar explicitamente a **Publicações específicas**, na mesma edição e conta, recupera a seleção e miniaturas anteriores, incluindo posts normais e Dark Posts juntos. Remoções deliberadas e seleção vazia são respeitadas. Agendamento continua exclusivo. Essa memória é temporária: salvar outro modo e recarregar não restaura alvos inativos. Trocar conta/perfil/usuário/automação não transfere a seleção. Nenhuma regra ativa é salva apenas por carregar metadados.
