# Atualização automática dos agendamentos para V112

## Para quem instala o MultiPost

Atualize para a versão que contém esta mudança e reaplique a stack. Não precisa
cadastrar IDs de canais, executar SQL nem reagendar post por post. Variáveis
antigas `POST_WORKFLOW_V112_*` podem ser retiradas: elas não são mais necessárias.

O serviço atualizado inicia os próximos posts em V112. No bootstrap, garante o
workflow singleton `migrate-post-workflows-v112`, na fila `main`. Ele examina lotes
de 50 posts e repete a varredura a cada cinco minutos. `continueAsNew` limita o
histórico. Backend e orchestrator podem chamar a inicialização: `USE_EXISTING`
garante que só exista um singleton ativo.

A mudança não adiciona tabela ou coluna e não precisa de uma migration SQL. É
uma **migração de execuções do Temporal**, executada pelo próprio aplicativo.

## Quais posts são migrados

A seleção vem do banco do produto, nunca de uma lista genérica do Temporal:

- raízes em `QUEUE`, com data futura, sem exclusão e sem ID/URL de publicação;
- perfil não excluído e canal ativo, sem reconexão pendente;
- workflow V101/V102 conhecido e correspondente ao mesmo post/organização;
- snapshot com a mesma data e canal atuais;
- timer inicial ainda aguardando, com mais de 30 minutos de folga;
- histórico sem qualquer activity além da leitura inicial `getPostsList`.

Filhos/comentários acompanham a raiz. Publicados, erros, rascunhos, passados e
posts com envio já iniciado permanecem fora do escopo. Canais indisponíveis são filtrados antes do lote e não geram log individual;
se voltarem a ficar ativos, seus posts futuros poderão entrar nas próximas
varreduras. Posts em janela próxima ou sem prova suficiente não são reiniciados;
a migração registra esses adiados e tenta novamente os elegíveis.
Não declarar migração integral enquanto houver pendentes não confirmados.

## Como a substituição funciona

1. Revalida post e histórico, fixando o `runId` antigo.
2. Encerra somente aquele run, com motivo exclusivo desta migração e deadline
   curto. Não utiliza o helper que termina todos os workflows por `postId`.
3. Relê o histórico final. Qualquer indício de envio impede criar substituto.
4. Revalida o post e inicia V112 no mesmo `workflowId`, com conflito `USE_EXISTING`.
5. Confere tipo e identidade do vencedor, preservando reagendamento concorrente.

Nenhum dado do post é regravado: data, mídia, conteúdo, tags e recorrência são
preservados. V112 lê novamente o banco antes de publicar. A migração não envia
posts para redes sociais e não força reconexão do canal.

Se o processo cair entre encerrar e iniciar, a próxima tentativa reconhece o
motivo no histórico final e retoma a criação. Um término feito pelo usuário ou
por outro processo não autoriza recuperação automática. Workflows já V112 são
no-op. Os históricos antigos e tipos V101/V102 permanecem disponíveis.

## Zernio

As activities continuam na fila `main`. O envio retorna um ID aceito e estado
pendente. O retorno torna esse aceite durável no histórico do Temporal. Uma
activity de suporte grava a referência no banco antes de consultar o resultado;
se o banco estiver indisponível, repete somente a escrita, sem reenviar o post.
O marcador `zernio-accepted-reference-v1` preserva replay de V112 antigos.
Só `published` confirma sucesso. `failed`, `partial` e `cancelled` encerram com
erro; estados desconhecidos aguardam confirmação. A consulta nunca cria outro
post. Um resultado parcial/incerto mantém a guarda de republicação explícita, inclusive
enquanto o post está em QUEUE aguardando confirmação.

Referência do contrato: [tratamento de erros Zernio](https://docs.zernio.com/guides/error-handling).

## Deploy e conferência

Faça backup do banco do produto e do Temporal antes da atualização. Atualize o
container que reúne backend/orchestrator de forma coordenada, com substituição
`stop-first`. Em topologia separada, pare a produção de novos jobs e os workers
antigos antes de ativar a nova versão. Não misture o produtor/migrador novo com
workers antigos: o contrato Zernio foi ampliado.

Nos logs, procure `[v112-migration]` (migrados, adiados e erros por lote) e
`reconcilePostWorkflowsV112 falhou`. Confirme no Temporal `postWorkflowV112` para
os pendentes e um agendamento recém-criado. Compare datas e estados com o backup
ou relatório anterior e acompanhe as primeiras publicações por provider.

Não há botão ou comando obrigatório para o aluno. Um administrador só precisa
intervir quando o relatório identificar uma condição que a migração não pode
resolver com segurança, como ausência de workflow ou envio já iniciado.

## Rollback

Voltar a imagem interrompe a criação padrão V112 pelo código anterior, mas não
converte os workflows já migrados. Mantenha uma versão capaz de executar V112
enquanto houver execuções dessa versão. Não reinicie em massa workflows que
podem ter enviado conteúdo e não trate reset como migração de versão.

## Limites de resultado desconhecido

Uma queda entre o envio externo e o retorno dessa activity ao Temporal continua
sendo resultado desconhecido. O aplicativo não repete automaticamente esse envio.
A guarda por referência protege depois da persistência; enquanto o banco estiver
indisponível, não reagende manualmente uma publicação em processamento. O retry
da escrita não equivale a uma garantia absoluta de envio único nem substitui
idempotência oferecida pela plataforma.
