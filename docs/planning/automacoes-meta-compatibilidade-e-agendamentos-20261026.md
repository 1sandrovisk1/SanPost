# Automações Meta: compatibilidade e vínculo com agendamentos

Atualização de 27/10/2026: o vínculo exato com agendamentos está implementado no [incremento de posts agendados](automacoes-posts-agendados-20261027.md). O contrato abaixo permanece como registro da análise original.

Data: 26/10/2026. **Decisão aprovada: trabalhar com Facebook e Instagram separados.** A separação inicial do criador é o incremento atual; a matriz, o vínculo com agendamentos e a migração de motores abaixo continuam sendo análise/plano.

## Decisão e primeiro incremento

O usuário aprovou escolher a rede no início. Novas automações Instagram usam o criador antigo com comentários, respostas a Stories e repost; Facebook usa o editor de comentários V2 com seleção apenas de Página Facebook. Não são migrados registros existentes: a edição de um V2 já salvo mantém suas plataformas, inclusive as duas redes quando já gravadas. O endpoint interno V2 continua retrocompatível; a separação deste incremento é a jornada do painel, não uma quebra de contrato da API.

Prioridade para o Facebook: **completar comentários em publicações**. As variações de respostas públicas foram implementadas no [incremento específico](facebook-public-reply-variations.md); a validação do vínculo de vídeo/Reel com seu comentário continua pendente. Depois, vínculo com posts agendados/API/MCP e dark posts/promocionais. Stories ficam para uma avaliação separada de gatilho, permissões e mensagens; não são ativados como consequência da separação visual.

## Escopo e conclusão

O usuário pediu avaliar os recursos antes de decidir entre automações conjuntas e separadas. A tela de credenciais está aprovada; esta análise trata do criador de automações, execução, API pública/MCP e publicações agendadas. As capturas do Manychat são referências de experiência, não prova das limitações da Meta.

**Recomendação:** selecionar a rede no começo do criador simples e manter uma automação operacional por canal. Reaproveitar o layout de formulário lateral + prévia, os componentes, a validação comum e os adaptadores de execução. A escolha de canal determina os recursos disponíveis. Uma futura ação de replicação/campanha pode criar as duas automações a partir de uma intenção, sem obrigar Instagram e Facebook a terem as mesmas configurações.

Não há uma proibição geral da Meta de construir uma interface com os dois canais. O custo dessa opção é modelar diferenças, autorizações, estados e configurações por canal. O V2 atual aplica uma definição comum; ele ainda não preserva toda a funcionalidade do Instagram antigo. Portanto, não deve substituir o legado como se já houvesse paridade.

Os fluxos compartilhados já existentes devem continuar preservados. Não apagar, dividir, ativar ou migrar automaticamente esses registros com base nesta recomendação. Uma eventual migração precisa conservar IDs referenciados, histórico, deduplicação e status, e evitar dois fluxos ativos respondendo ao mesmo evento.

Há uma restrição de transição importante: o bloqueio atual entre comentários V1 e V2 é por conta remota, inclusive em posts diferentes. Portanto, direcionar todos os novos comentários Instagram ao V2 enquanto o legado mantém recursos exclusivos impediria algumas combinações de uso. Preservar o criador Instagram antigo até a paridade, ou desenhar uma migração explícita, faz parte da recomendação; apenas preservar os registros antigos não basta.

## Matriz: o que existe e o que realmente difere

“Possível” não significa implementado ou validado no MultiPost. “V2” abaixo inclui o editor novo, mesmo quando selecionada somente uma rede.

| Recurso | Instagram antigo | Facebook / Meta | V2 atual e consequência |
|---|---|---|---|
| Comentário em post → mensagem privada com link | Implementado | Suportado; teste real do Escorpião confirmado pelo usuário | Caso básico implementado. A entrega real do Facebook foi validada; não estender essa comprovação ao Instagram V2 sem teste próprio. |
| Filtro por palavras, qualquer/todas/exata | Implementado | Pode ser calculado no MultiPost a partir do comentário | Implementado no grafo comum. |
| Resposta pública ao comentário | Implementado | Suportado com acesso/permissões da Página | Implementado. |
| Várias respostas públicas, escolhendo uma por execução | Implementado (`replyMessages`) | Não depende de um recurso exclusivo do Instagram; o MultiPost escolhe o texto antes de enviar | Implementado em 26/10: formulário e canvas editam até dez alternativas; ingestão escolhe uma por nó e persiste o texto nas ações da execução. |
| Enviar o link só depois de seguir o perfil | Implementado com interação inicial, consulta de relacionamento e continuação | Não foi encontrado equivalente documentado de `is_user_follow_business` para verificar se uma pessoa segue a Página | **Não portado ao V2.** Deve permanecer opção do Instagram; não substituir por um botão “Já segui” sem verificação real. |
| Mensagem inicial com botão de interação, confirmação e tentativas do follow gate | Implementado no fluxo antigo | Messenger suporta postbacks/interação, mas isso não comprova a condição de seguir a Página | O V2 tem botão de URL; não possui o mesmo protocolo de postback/continuação. Um botão que abre um site não equivale a uma resposta à conversa. |
| Responder apenas publicamente, sem DM | Permitido pelo formulário antigo | Tecnicamente possível | O grafo V2 admite ação pública isolada; o helper/editor rápido precisa manter essa possibilidade sem obrigar uma DM. Auditar contrato e UX antes de portar. |
| Post específico, todos ou próxima publicação | Implementado | Compatível com roteamento por ID e conta | Implementado; “próxima” não resolve vários agendamentos individuais. |
| Dark posts/anúncios/impulsionados | Campo de aliases + tratamento de comentários não vinculados no legado | Há suporte de plataforma a comentários/anúncios e o Manychat oferece seleção de promocionais | O V2 não reaproveita `FlowMediaAlias`/tratamento de IDs de anúncio. Não declarar que Facebook não suporta; falta implementação e validação por formato, permissão e ID do objeto. |
| Resposta a Story | Criador e processamento próprios no legado | Não é o mesmo gatilho de comentário no feed da Página | V2 aceita somente `comment_on_post`; não anunciar equivalência de Stories ou Live. |
| Condições e atrasos no construtor visual | Implementado com restrições próprias | Reutilizável para lógica local, respeitando janela da Meta | V2 inclui esses nós, mas limita atrasos e consolida mensagens privadas consecutivas em uma única resposta. Não é um bot de conversa irrestrita. |
| Vínculo a um post interno ainda agendado | Ausente | Agendamento nativo da Meta é outro mecanismo | Ausente nas duas versões. Exige contrato e persistência novos. |
| Criar por API pública/MCP/CLI | API pública V1 e ferramenta MCP usam o motor antigo do Instagram | O novo Facebook não foi exposto nesses contratos | A rota interna `/flows-v2` não significa disponibilidade na API pública ou no MCP. |

### Regras da Meta que afetam o desenho

As respostas privadas a comentários são uma abertura limitada de conversa: uma resposta inicial por comentário dentro da janela aplicável, e continuação condicionada à interação do destinatário e à janela de mensagens. Para posts comuns, a documentação consultada estabelece sete dias para a resposta privada inicial; Instagram Live tem condição própria, durante a transmissão. Não transformar vários nós de DM em mensagens adicionais sem uma interação que habilite a continuação. [Instagram Private Replies](https://developers.facebook.com/docs/instagram-platform/private-replies/) · [Messenger Private Replies](https://developers.facebook.com/docs/messenger-platform/discovery/private-replies/).

A API de perfil do Instagram documenta `is_user_follow_business`, mas exige consentimento/interação de mensagens para acesso ao perfil. O comentário sozinho não concede esse acesso. Essa é a razão para a etapa de interação no follow gate. A API de perfil do Messenger consultada não fornece uma equivalência documentada para seguir a Página; ausência de documentação suficiente não deve virar promessa de suporte. [Instagram User Profile](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile/) · [Messenger User Profile](https://developers.facebook.com/docs/messenger-platform/identity/user-profile/).

Anúncios exigem atenção ao objeto recebido: a documentação de mensagens do Instagram descreve comentários em anúncios/impulsionados e campos de anúncio. O seletor de posts publicados não cobre automaticamente esses objetos. [Instagram Messaging: Private Replies](https://developers.facebook.com/documentation/business-messaging/instagram-messaging/features/private-replies/).

Os limites de texto, botões, templates e permissões precisam ser validados por adaptador e pela rota de login. Hoje o V2 reutiliza `validateFacebookPrivateReply` para ambos. Isso não comprova que todos os limites são iguais; um futuro catálogo de capacidades deve expressar os limites de cada operação, sem herdar limites de UI do Manychat como se fossem limites da Meta.

### O que podemos concluir do Manychat

O Manychat documenta gatilhos de comentário separados e conversão por cópia entre canais, com componentes incompatíveis e gatilhos que precisam ser reconfigurados. Isso reforça o valor de apresentar capacidades por rede. Não comprova uma obrigação da API de manter editores distintos, nem revela a razão interna da arquitetura deles. [Conversão entre canais](https://help.manychat.com/hc/en-us/articles/14281167702428-How-to-convert-automation-to-another-channel).

No Facebook, a seleção inclui publicados, agendados, promocionais e personalizados. No Instagram, há post específico, qualquer post/próximo post e opções de resposta. São referências para nossa seleção, sem assumir que tudo já está disponível no MultiPost. [Comentários Facebook](https://help.manychat.com/hc/en-us/articles/14281386567836-Facebook-Comments-Trigger) · [Comentários Instagram](https://help.manychat.com/hc/en-us/articles/14281316989724-Instagram-Post-and-Reel-Comments-trigger).

## Por que separar sem duplicar o produto

Uma automação conjunta pode ser implementada, mas “um formulário para os dois” não garante que cada recurso funcione igual. Para oferecer o follow gate só no Instagram, por exemplo, seriam necessários configuração e caminho de execução específicos para esse canal. A interface conjunta passaria a administrar dois comportamentos sob um mesmo registro.

A proposta mais simples para o aluno é:

1. Escolher Instagram ou Facebook (mensagem entregue pelo Messenger).
2. Escolher conta/Página e post publicado ou agendado.
3. Configurar palavras, respostas e recursos válidos para a rede escolhida.
4. Opcionalmente replicar a parte compatível para a outra rede, revisando diferenças antes de ativar.

Mesmo num fluxo conjunto, o comentário do Facebook gera uma execução Facebook; o comentário do Instagram gera uma execução Instagram. Não existe uma identificação automática de que o comentarista de uma rede é a mesma pessoa na outra, nem autorização implícita para enviar a ele pelo outro canal.

**Reutilização proposta:** base visual e validação de campos comuns; catálogo de capacidades consultado por UI/API/MCP; adaptadores de identidade, posts, webhooks e envio por plataforma; continuidade específica do Instagram preservada. O formato interno definitivo do motor depende do plano de migração — esta recomendação não exige reescrever o legado imediatamente.

## Agendamentos: o problema existe no código atual

O MultiPost já cria `Post.id` antes da publicação. Depois de publicar, grava `releaseId` e `releaseURL`. O ponto de integração existe em `PostActivity.updatePost(id, postId, releaseURL)`.

Entretanto, essa atividade chama os vínculos de “próxima publicação” por integração. No V2, `SharedFlowsRepository.bindNext` atualiza todas as configurações ativas pendentes daquela integração; no legado, `FlowsService.bindPendingFlowsToPost` também percorre as pendentes. Assim, várias automações podem se vincular ao mesmo post. Há ainda vínculo alternativo pelo primeiro comentário recebido: ele não comprova qual publicação foi criada por último e não deve resolver o vínculo de um agendamento específico.

O `group` do post também não é uma chave segura para esse vínculo: `PostsRepository.createOrUpdatePost` pode regenerá-lo ao editar. A referência precisa ser o registro persistente do destino, com escopo de organização, perfil e integração.

### Contrato proposto, ainda não disponível

Adicionar seleção explícita de destino, por exemplo:

```json
{
  "integrationId": "canal-do-perfil",
  "target": {
    "type": "scheduled_post",
    "postId": "id-interno-do-post-no-multipost"
  },
  "keywords": ["QUERO"]
}
```

O nome exato dos campos e endpoints será fechado na implementação API-first. `postId` interno não deve ser confundido com o ID remoto retornado pela Meta.

Estados propostos: **aguardando publicação → vinculado ao post publicado → apto a processar comentários**. Publicação cancelada, removida ou com falha deve ficar visível e não transformar o alvo em “todos os posts”.

Após a publicação, persistir o vínculo exato `organização + perfil + integração + Post.id + ocorrência de publicação → ID remoto`. Normalizar o ID conforme o tipo de publicação e webhook: foto, vídeo, Reel e post do feed podem usar identificadores diferentes. Não inferir silenciosamente pelo link público.

Requisitos de confiabilidade:

- Validar propriedade do post e da integração no servidor; IDs de outros perfis/organizações não podem ser vinculados.
- Reagendar o mesmo post mantém o vínculo. Duplicar cria outro post e exige associação própria. Trocar a conta de destino exige revalidação.
- Publicação recorrente/republicação precisa identificar a ocorrência para não reutilizar o ID remoto anterior.
- Usar persistência transacional e entrega durável do evento de publicação (outbox/reconciliação). Uma falha ao vincular não pode obrigar a republicar nem perder a associação.
- Tratar o comentário que chegar entre publicar e concluir o vínculo, sem buscar e disparar retroativamente todos os comentários antigos. Preservar deduplicação e elegibilidade temporal.
- Criar a associação antes de enfileirar uma publicação imediata. Duas chamadas independentes “publicar agora” e “criar automação depois” têm uma corrida real.
- Falha em um destino não deve apagar o sucesso do outro. Resultados por item, reenvio idempotente e recuperação seletiva precisam constar no contrato do lote.

Dois detalhes do código reforçam esses requisitos: quando existe canal V2 ativo, `AutomationEvent` é persistido antes de verificar a correspondência do post/gatilho e uma reentrega já existente é descartada; portanto, o vínculo posterior precisa reconciliar os eventos elegíveis, e não contar com um retry da Meta. Sem canal V2 ativo, o receptor retorna sem persistir o evento; o desenho de “aguardando publicação” precisa definir explicitamente a elegibilidade de captura. Também existe `updateReleaseId` para corrigir publicação com ID ausente, fora de `PostActivity.updatePost`; esse caminho deve participar da resolução. A outbox `AutomationDispatch` atual cobre execução, não o vínculo entre post publicado e automação.

Há ainda um caso concreto de identificadores: o provider Facebook retorna `videoId` simples no ramo MP4, enquanto o parser de comentários exige `post_id` composto `Página_Post`. Copiar `releaseId` por igualdade literal não comprova o funcionamento para vídeo/Reels. A normalização e os testes por formato são parte necessária desta feature.

Exemplo: 30 conteúdos para Instagram e Facebook geram **60 destinos de publicação**. Com a proposta de um canal por automação, podem gerar 60 automações vinculadas, agrupadas visualmente em 30 campanhas se isso for útil. O agente de IA pode preparar tudo com uma única instrução do usuário; isso não exige um único registro de automação.

Essa feature funciona com automações separadas ou conjuntas. Ela influencia o **modelo de alvo e o contrato da API**, mas não obriga escolher os dois canais juntos. Convém desenhá-la agora e implementá-la antes de apresentar o fluxo de “planejar o mês inteiro” como concluído.

### Agendado na Meta não é o mesmo que agendado no MultiPost

A Pages API permite criar determinados posts com `published=false` e `scheduled_publish_time`, retornando um ID antes de torná-los públicos. É diferente da fila local do MultiPost, que publica pelo worker na data programada. A aba de agendados do Manychat não comprova suporte aos registros internos do MultiPost. Não precisamos migrar nosso agendamento para a Meta para resolver o problema: já temos IDs internos. [Pages API: Posts](https://developers.facebook.com/docs/pages-api/posts/).

## API pública, MCP e CLI: lacunas e evolução

Hoje `/public/v1/flows` usa `QuickCreateFlowDto`/`FlowsService` do Instagram. O MCP `createCommentAutomationTool` usa esse mesmo motor, mas seu schema não expõe todos os campos do DTO: por exemplo, oferece `replyMessage`, sem a lista `replyMessages` nem todos os controles da mensagem de abertura. O CLI encaminha o contrato V1. O V2 do painel não é automaticamente um contrato público.

Antes de implementar a próxima etapa:

1. Definir capacidades por plataforma, operação e rota de credencial. UI e agentes precisam saber o que é aceito.
2. Definir um contrato público aditivo/versionado com destino publicado ou agendado, e a mesma autorização do domínio usada pelo painel.
3. Expor criação individual e, se necessário, composição em lote. Retornar IDs/status por destino e erros explícitos por campo/rede; nunca ignorar `requireFollow` no Facebook ou descartar variações silenciosamente.
4. Manter compatibilidade de V1 e definir migração explícita. Não alterar o significado de `next_publication` para uma associação aleatória com a fila.
5. Fazer o MCP reutilizar o serviço e o schema de negócio. Uma solicitação “publique nas duas redes e crie automações” pode criar dois destinos e duas automações, com idempotência por item.

## Evidência local e pontos de código

- `apps/frontend/src/components/automations/automation-wizard.component.tsx`: formulário antigo, variações, follow gate e aliases.
- `libraries/nestjs-libraries/src/dtos/flows/flow.dto.ts`: contrato V1/quick create.
- `libraries/nestjs-libraries/src/database/prisma/flows/flows.service.ts`: criação, vínculo “próxima”, comentários e continuação do legado.
- `libraries/nestjs-libraries/src/database/prisma/flows-v2/flow-definition.ts`: tipos/configurações aceitos, consolidação de DM e seleção de alternativa por seletor injetado; a ingestão sorteia e persiste o texto no snapshot.
- `libraries/nestjs-libraries/src/database/prisma/flows-v2/shared-flows.service.ts` e `shared-flows.repository.ts`: ativação, canais, escopo, vínculo e deduplicação.
- `libraries/nestjs-libraries/src/integrations/automations/comment-channel.service.ts`: roteamento, readiness, propriedade do post e envio.
- `libraries/nestjs-libraries/src/integrations/automations/facebook-comment-automation.adapter.ts`: recorte dos comentários Facebook processados.
- `apps/orchestrator/src/activities/post.activity.ts` e `libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts`: gravação do resultado e vínculo após publicação.
- `apps/backend/src/public-api/routes/v1/public.flows.controller.ts` e `libraries/nestjs-libraries/src/chat/tools/create.comment.automation.tool.ts`: superfícies públicas atuais.

## Pendência Instagram do Escorpiano: diagnóstico separado

Em 26/10/2026, o token cadastrado respondeu a consultas da conta `17841465505873236`. A inscrição por conta inicialmente retornou somente `messages`. Foi acrescentado **apenas `comments` nessa conta**, preservando `messages`, e a leitura posterior confirmou os dois campos. Nenhum outro perfil/Página foi alterado por essa operação.

O usuário confirmou aplicativo Meta `841571281566716`, ID do caso de uso Instagram `2882877478718411` e callback `https://localmultipostapi.automacaosemlimites.com.br/public/ig-webhook`. O nginx local encaminha esse caminho de backend e o alias `/api/public/ig-webhook` do frontend para o mesmo controlador. Não foi substituído o callback configurado na Meta.

Uma verificação HTTP somente leitura, usando o token de verificação já salvo sem expô-lo, confirmou HTTP 200 e o desafio correto nos dois endereços. Isso comprova acessibilidade/verificação do receptor, não a entrega de um evento real pela Meta.

O verificador V2 tenta consultar `/{instagramAppId}/subscriptions` com a credencial do caso de uso no Graph Instagram. A consulta não foi aceita; o endpoint de conta retornou uma identificação de aplicativo diferente dos IDs informados. Isso demonstra que a comparação atual não está validada para esse arranjo de Instagram Login; não comprova token inválido ou webhook mal configurado. Consultas com o aplicativo principal também não confirmaram a configuração Instagram.

**Recebimento real confirmado:** após o novo comentário solicitado, o backend registrou em 26/10/2026 às 13:57:24 UTC (10:57:24 em São Paulo) `object=instagram`, campo `comments`, conta `17841465505873236`, comentário `18119548892072399`, mídia `17929861206008387`. A assinatura foi válida com `instagramAppSecret` de credenciais da organização proprietária, e o controlador encontrou uma integração para essa conta. O callback configurado pelo usuário funciona.

**Pendência V2:** a verificação de prontidão do aplicativo descrita acima continua inconclusiva. A consulta à `AutomationEvent` vazia não demonstra outra falha: só existe o fluxo `446d33b2-e4cb-4227-859e-eb8f03f24e85` em `DRAFT` para essa integração, e `ingest` só persiste eventos quando encontra um canal V2 ativo. O rascunho permanece sem ativação; nenhum envio Instagram V2 foi confirmado. Não remover validação, equiparar IDs por suposição ou marcar como pronto apenas para esconder o aviso.

## Verificações exigidas para a implementação posterior

A auditoria original não executou a matriz futura abaixo. O incremento de separação da entrada passou em 140 testes de interface, TypeScript e validação no navegador, conforme o [registro de progresso](facebook-instagram-implementation-progress.md). Esses resultados e os de etapas anteriores em `docs/operations/multipost-local-development.md` não representam cobertura dos recursos futuros aqui propostos.

- Regressão do Instagram antigo: comentários, Stories, variações, aliases, gate, postbacks, renovação e escopo de perfil.
- Capacidades: campos exclusivos recusados de forma explícita, paridade formulário/construtor/API/MCP e limites por adaptador.
- Variações: seleção persistida por execução, sem sorteio diferente num retry e sem duplicar envio.
- Agendamentos: 30 alvos distintos, duas redes, publicação fora de ordem, falha parcial, cancelamento, reagendamento, duplicação, recorrência e mudança de integração.
- Corridas: webhook cedo, publicação concluída com falha de vínculo, repetição do evento de publicação, reinício do worker e repetição do mesmo pedido via API.
- Isolamento: mesmo aplicativo Meta com várias contas e perfis, assinatura por escopo, token trocado/removido, post de outra conta, limites entre organizações.
- Migração: manter histórico/estado dos compartilhados existentes e bloqueio de sobreposição com o legado até haver transição segura.
- Testes reais controlados: separar recebimento, aceitação da Meta e confirmação no destino. Não afirmar funcionamento de anúncios/Reels/Stories a partir de um teste em post comum.

## Estado das decisões e próximos incrementos

1. Recebimento do Instagram confirmado; verificação de prontidão do Instagram V2 ainda pendente, sem enfraquecer o isolamento.
2. Experiência por rede aprovada e implementada na entrada do painel, preservando os fluxos existentes.
3. Instagram novo usa o criador original. Variações públicas implementadas no V2; validar comentários em vídeos/Reels e continuar os recursos comuns faltantes.
4. Implementar vínculo exato com posts agendados junto dos contratos API/MCP.
5. Só então ampliar o layout ou adicionar replicação/campanhas em lote.
