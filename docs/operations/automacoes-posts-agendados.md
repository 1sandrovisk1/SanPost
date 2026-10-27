# Automação de comentários para um post agendado

Facebook e Instagram usam regras separadas. É possível agendar o mês inteiro e criar uma automação para cada destino, antes da publicação, sem usar “próxima publicação”.

## Pelo painel

1. Agende o post de Feed/Reel pelo calendário do MultiPost.
2. Crie uma automação de **comentário em publicação** na rede desejada.
3. Selecione a mesma conta/Página e abra **Selecionar publicações**, dentro da opção de publicação específica.
4. Escolha a miniatura com a tag **Agendado**. Data e legenda ajudam a identificar o post. Configure palavras-chave, respostas e demais recursos do canal. A galeria reúne publicados e agendados, mas a seleção continua exclusiva: publicações já publicadas ou um agendamento.
5. Salve/ative conforme o editor. Enquanto o post estiver na fila, a automação aguarda a publicação. Depois monitora somente aquele post e a etiqueta **Agendado** desaparece da miniatura, inclusive ao reabrir o editor. Nenhuma etiqueta Publicado é adicionada, seguindo o padrão dos demais posts. A associação ao agendamento permanece; a mudança visual não transforma nem recria a regra.

Nos editores rápidos de comentários, a ordem é a mesma: condições de palavras-chave, resposta pública opcional com suas variações e mensagem privada com botão/link. Labels e exemplos comuns são iguais nas duas redes. Variáveis disponíveis, limites e recursos exclusivos continuam específicos do motor. Messenger usa palavras-chave e mensagem privada, sem opção de resposta pública.

Reagendar o mesmo registro mantém a associação. Duplicar um post cria outro registro e não copia a automação. Um agendamento em Facebook e Instagram tem dois destinos internos e precisa de duas automações. Cancelamento, remoção, mudança de conta/perfil ou publicação com falha não ampliam a regra para todos os posts. Os estados aparecem junto do seletor. Agendamentos recorrentes ainda são recusados: a escolha de ocorrência será uma evolução separada. Messenger e Stories não oferecem este modo.

## API e MCP

A fachada recomendada para agentes é `/public/v1/automations`, com o mesmo payload declarativo nas duas redes. Veja [contrato completo API/MCP](../api/automations-agent-api.md). Os endpoints `/flows` e `/flows-v2` abaixo permanecem compatíveis. A nova fachada exige `expectedUpdatedAt` do detalhe para editar V1 e `expectedRevision` para editar/alterar status V2; campos omitidos no patch são preservados.

Use o `postId` interno retornado ao agendar o destino (`integrationSchedulePostTool`/API de posts). Não use o `group`, o ID remoto da Meta, nem um ID de outro destino do mesmo agendamento. O payload é aditivo:

```json
{
  "name": "Ebook de novembro",
  "integrationId": "CANAL_INSTAGRAM",
  "postMode": "scheduled",
  "scheduledPostId": "POST_ID_INTERNO_DO_DESTINO",
  "keywords": ["QUERO"],
  "dmMessage": "Aqui está o material: https://example.com/ebook"
}
```

Instagram: `POST /public/v1/flows` cria/ativa; `PUT /public/v1/flows/:id` preserva a referência no mesmo contrato. Continua a validação de conexão e os recursos originais do Instagram. Regras ativas podem ser editadas; as alterações passam a valer ao salvar. O vínculo e o histórico são preservados, e eventos pendentes da configuração anterior são invalidados.

Facebook: `POST /public/v1/flows-v2` salva rascunho com canais e definição; `POST /public/v1/flows-v2/:id/status` ativa com `expectedRevision`. `GET/PUT /public/v1/flows-v2/:id` e `GET /public/v1/flows-v2` permitem revisar/editar/listar. Uma chave de perfil opera apenas no próprio perfil; uma chave de organização informa `?profileId=...`.

```json
{
  "name": "Ebook de novembro · Facebook",
  "channels": [{
    "integrationId": "CANAL_FACEBOOK",
    "postMode": "scheduled",
    "scheduledPostId": "POST_ID_INTERNO_DO_FACEBOOK",
    "postIds": []
  }],
  "definition": {
    "nodes": [
      {"id":"trigger","type":"TRIGGER","positionX":250,"positionY":30,"data":"{\"triggerType\":\"comment_on_post\",\"keywords\":[\"QUERO\"],\"matchMode\":\"any\"}"},
      {"id":"dm","type":"SEND_DM","positionX":250,"positionY":180,"data":"{\"message\":\"Aqui está o material: https://example.com/ebook\"}"}
    ],
    "edges": [{"id":"e1","sourceNodeId":"trigger","targetNodeId":"dm"}]
  }
}
```

Consulta dos agendamentos: `GET /public/v1/flows-v2/scheduled-posts/:integrationId` com o mesmo escopo, `cursor` e `selectedId` opcionais. A versão privada do painel é `GET /automation-scheduled-posts/:integrationId`. O retorno contém `posts`, `nextCursor` e, quando localizado, `selected`; não retorna tokens nem linhas completas do banco.

MCP: `createCommentAutomationTool` aceita `postMode="scheduled"` e `scheduledPostId`, com `platform="instagram"` (padrão) ou `platform="facebook"`. Facebook usa o perfil ativo e devolve `executionVersion: 2` numérico. Consulte o detalhe com `getCommentAutomationTool`; envie esse motor e a revisão atual no `setCommentAutomationStatusTool`. Se uma etapa posterior à criação falhar, a resposta conserva `id`, `saved=true` e um código controlado em `activationError`; corrija a configuração/conexão e retome o mesmo ID, evitando outra criação.

Para 30 agendamentos, faça 30 associações exatas, por destino. Não há operação em lote transacional nem criação conjunta “publicar agora + automação”: esta versão trata posts que já estão agendados na fila local, antes de publicar. Não confundir com agendamento nativo no painel Meta.

Agentes também podem [consultar, editar e reagendar o post existente por API/MCP](../api/posts-agent-api.md). A edição usa o ID interno do destino e `expectedVersion` do detalhe, sem remover o vínculo da automação nem modificar outro canal do grupo. Em falha parcial `saved=true`, retome o mesmo registro; não crie um substituto. Excluir localmente preserva os targets e não exclui a publicação da rede.

## Entrega, recuperação e limites da validação

O alvo é persistente por automação/integração e aponta para `Post.id`. O resultado da primeira publicação é congelado na mesma transação que salva `releaseId`, incluindo a correção de `missing`. Criação do alvo e publicação compartilham o bloqueio do registro Post. No Facebook, um ID de vídeo simples só vira post composto após comprovar a relação nos anexos do post da Página; indisponibilidade dessa leitura mantém o evento pendente, sem adivinhar IDs.

Uma fila própria guarda apenas eventos recebidos por receptores autenticados/verificados, posteriores à configuração/ativação e elegíveis para o destino. A fila não amplia os modos normais nem reaplica comentários antigos a novas definições. Um reconciliador a cada 15 segundos espera o resultado, revalida escopo/estado/versão e despacha com identificação estável. O evento pode aguardar até 24 horas; após expirar é descartado para execução. Dados da captura são removidos na limpeza horária e no boot (`StartupMigrationService`), sete dias depois da expiração. Históricos próprios dos motores mantêm sua política anterior.

Em 27/10/2026, o usuário confirmou que agendou, criou as regras antes de publicar e recebeu as respostas no Instagram DM e no Messenger após a publicação. Esta é confirmação manual do usuário, sem novo envio executado pelo agente nesta revisão.

O banco isolado cobre 30 alvos, publicação invertida, eventos antecipados, deduplicação, concorrência, isolamento, rollback e correção do resultado. Isso não equivale a uma publicação e resposta reais na Meta. Qualquer nova prova real continua restrita ao Escorpiano.

## Próxima publicação e edição

“Próxima publicação” continua separada da escolha de uma publicação específica. Ela não deve consumir um post reservado por uma automação de agendamento ativa. O vínculo já resolvido não é rearmado ao editar texto, botão ou variações.

Quando a Meta ainda não confirmou a relação entre vídeo e publicação, o vínculo pode aguardar a resolução do ID. Uma fila independente guarda o comentário e somente as regras de próxima publicação existentes naquele momento, com revisão/data e perfil. Reentregas não geram nova resposta; regras editadas ou criadas depois não recebem o evento anterior. Editar/excluir outra automação agendada não apaga essa fila. O reconciliador usa a mesma retenção e limpeza das capturas; indisponibilidade persistente da consulta de vídeo exige revisar o acesso à publicação, sem tentar adivinhar o ID.

Ao salvar uma regra Facebook ativa, conexão, propriedade do post e conflitos do Messenger são revalidados. Nome, resposta e condições usam uma nova revisão; execuções pendentes da revisão anterior são canceladas. O canal conserva identidade, fronteira de ativação e post vinculado quando a origem não mudou. Alterar a origem reinicia a fronteira de ativação.

## Migração e desenvolvimento

DDL aditiva: `20261027_scheduled_comment_automations/migration.sql`, com `ScheduledAutomationTarget` e `ScheduledAutomationEvent`. A migração adicional `20261027_deferred_next_automations/migration.sql` cria somente `DeferredNextAutomationEvent`, sem FK em cascata para as regras. Não altera associações antigas. Não há backfill de regras existentes. Para rollback de aplicação, pause primeiro as regras agendadas; conservar as tabelas preserva as referências para retomada. Excluir tabelas exige exportação/decisão explícita e não é necessário para reverter as views.

No modo local de desenvolvimento, alterações de schema geram o cliente Prisma Linux dentro do contêiner antes de iniciar os serviços, sem montar `node_modules` do Mac e sem criar imagem. A migração continua explícita; o start não executa `db push` nem altera dados. Alterações de dependências continuam exigindo imagem compatível.
