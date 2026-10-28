# Histórico e detalhes de execuções

Atualizado em 28/10/2026. Instagram, Facebook e Messenger usam a mesma tabela e o mesmo drawer dentro da aba **Histórico** da automação. Credenciais, disparos, regras e envios não são alterados ao consultar essa tela.

## Uso

- Consulte participante, interação, canal/gatilho, situação e início. O ID do participante aparece quando o nome não foi registrado; dados ausentes são identificados.
- Filtre por situação e período (todo o histórico ou últimos 7/30/90 dias). Filtros são aplicados no servidor, antes da paginação, e levam à primeira página. As páginas têm até 25 execuções; não há contador de total global.
- **Atualizar** repete somente a consulta. Há atualização automática enquanto a aba estiver montada; fechar/alternar a aba interrompe a consulta. O filtro e a página permanecem ao fechar o detalhe.
- **Ver detalhes**, clicar na linha ou usar o botão pelo teclado abre um drawer com interação recebida, etapas registradas, resultados e referências técnicas. Escape/Fechar fecham o painel; a lista e o rascunho do editor permanecem preservados.
- Datas respeitam o idioma; em português usam pt-BR, com hora de 24h. O nome localizado do fuso do navegador fica identificado junto aos filtros; a ajuda informa o identificador IANA. Não confundir com o horário de uma conta ou servidor Meta.

No Histórico, o nome fica somente leitura e **Salvar** fica oculto. O aviso de rascunho continua visível. Ligar uma automação com alterações pendentes exige voltar ao editor; não há salvamento indireto no modo de consulta. Pausar permanece disponível para uma regra ativa.

A atualização automática fica indicada no cabeçalho; o botão com ícone refaz a consulta manualmente. A paginação só aparece quando existe outra página ou quando o usuário já avançou. Não há contagem global inferida das linhas visíveis.

## Como interpretar

| Situação | Significado |
| --- | --- |
| Concluída | Processamento concluído; não é confirmação de entrega de uma mensagem |
| Aguardando interação | Execução aguarda clique/resposta do destinatário; não é necessariamente falha |
| Em processamento | Registro pendente ou em execução |
| Falhou | Houve falha registrada; consultar etapas e conexão |
| Ignorada ou cancelada | Regra não prosseguiu pelas condições/prioridade, ou foi cancelada |
| Resultado não confirmado | O resultado do envio é ambíguo; não reenviar automaticamente |

O ledger V2 com entrega `UNKNOWN` prevalece sobre o status final da execução, também ao filtrar no banco. A tela não oferece botão de reenviar. Quando há evidência `higher_priority`, a linha e o drawer exibem **Ignorada por prioridade**; outras ignoradas/canceladas não recebem essa causa. As causas conhecidas (credencial, app, permissão, limite da Meta e filtros/gate) são apresentadas por uma lista permitida, sem texto bruto de erros.

### Diferenças dos registros

**Instagram V1:** a timeline vem de `executionLog`. Uma etapa `SEND_DM completed` pode registrar somente a preparação da mensagem, porque o envio ocorre depois. Por isso a interface mostra **Etapa concluída**, sem afirmar aceite ou entrega. O texto histórico de saída não é reconstruído usando o fluxo atual. `follow_check` é uma verificação registrada, com resultado daquela ocasião; não representa a situação atual do seguidor. Registros desconhecidos ficam não classificados e logs inválidos não impedem consultar o resumo.

**Facebook/Messenger V2 e regras V2 antigas do Instagram:** o evento e a mensagem configurada vêm do snapshot daquela execução; os resultados vêm das entregas persistidas. O campo real da ação é `text`, e o mapeamento respeita `private_reply`, `messenger_reply` e `public:<nodeId>`. **Aceito pela Meta** significa solicitação aceita, sem comprovar entrega ou leitura. Ações planejadas sem registro de entrega não são apresentadas como etapas executadas. Messenger aparece como mensagem recebida, sem atribuir origem a um Story.

O drawer mostra somente fatos disponíveis. A explicação sobre aceite fica na ajuda junto a **Etapas registradas**, somente quando existe uma etapa aceita. O texto configurado aparece diretamente na etapa, sem label repetido. Detalhes técnicos iniciam recolhidos. Um registro V1 de espera por postback continua associado ao TRIGGER original e é identificado como **Gatilho · Aguardando clique**, sem fabricar um nó posterior. Quando não há entradas de etapa, informa a ausência. Logs V1 acima de 200 entradas mostram as últimas 200 com aviso; textos recebidos acima de 2.000 caracteres aparecem como trecho identificado. Payload, definição completa, erro bruto, stack e credenciais não são retornados. Detalhes técnicos mostram apenas IDs selecionados, motor, revisão e datas, quando disponíveis.

## Contrato autenticado de leitura

- `GET /automation-history/:engine/:flowId`
- `GET /automation-history/:engine/:flowId/:executionId`

`engine` aceita `instagram` (V1) ou `shared` (V2). A organização e o perfil vêm da sessão autenticada, nunca da query. As leituras conferem simultaneamente organização, perfil ativo, fluxo, versão e execução. Perfil ausente é recusado; outro perfil/fluxo/execução não retorna dados.

Query da lista: `status=all|completed|waiting|failed|running|skipped|unknown`, `from`/`to` ISO, `limit` 1–50 (25 por padrão) e `cursor` opaco. Resposta `AutomationExecutionPage` com `items` e `nextCursor`. Ordenação estável por criação e ID decrescentes; cursor inválido ou intervalo invertido é recusado. Filtros não se limitam às linhas visíveis. Não há totais inferidos da página nem limite oculto às últimas 100 execuções.

DTO e tipos: `libraries/nestjs-libraries/src/dtos/flows/automation-history.dto.ts`. Controller → service de projeção → repository Prisma. O controller está em `authenticatedController`, usa `Cache-Control: no-store` e não registra payload. A chave do cache de leitura frontend inclui usuário e perfil. Os endpoints anteriores de execuções permanecem compatíveis. Agentes podem consultar as mesmas projeções pelas novas rotas `/public/v1/automations/:id/history` e `/public/v1/automations/:id/history/:executionId` ou pelas ferramentas `getAutomationExecutionHistoryTool` e `getAutomationExecutionDetailTool`, sem operação de envio. O motor é indicado por `executionVersion=1|2`; o escopo vem da chave/contexto. Contrato completo em [Automações por API e MCP](../api/automations-agent-api.md). As leituras normalizadas públicas e privadas aplicam 60/minuto por organização/handler.

## Validação

Testes cobrem autorização, filtros/cursor, contrato HTTP, projeção sem dados brutos, semântica do ledger/log, drawer, datas, estados de erro/vazio/carregamento e proteção de rascunho. Conferência real apenas no navegador local do perfil Escorpiano, usando consultas e sem salvar, ativar, pausar ou enviar mensagens. Não há migração de banco nem nova imagem Docker; o backend precisa ser recompilado e o app local reiniciado para disponibilizar a nova leitura.


### Ajustes de interação (28/10)

Atualizar agora mostra estado ocupado, animação, sucesso ou falha, mantendo os registros já carregados em caso de erro. O resultado de uma consulta antiga não é anunciado em outro filtro/página. A atualização automática continua no intervalo existente enquanto a aba está montada.

O fuso aparece somente na ajuda do cabeçalho Início e corresponde ao fuso usado para formatar as datas no navegador. Tooltips usam portal ancorado sem alterar o layout, com hover, foco, fixação por clique, fechamento externo/Escape e limite da viewport. Dentro de drawer modal, o portal permanece na camada do próprio diálogo; Escape fecha primeiro a ajuda.
