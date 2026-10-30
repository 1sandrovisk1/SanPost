# Artigos do X

O canal nativo do X oferece **Post** e **Artigo** nas configurações do novo compositor. O artigo mantém o HTML de parágrafos, títulos, listas, negrito, sublinhado, links HTTP(S) e imagens da biblioteca. A capa é escolhida separadamente. Títulos de nível 3 são enviados como nível 2, acompanhando a correção do Postiz para a recusa do endpoint do X.

## Uso

1. Conecte a conta pelo canal nativo do X. A conta e o aplicativo precisam ter acesso à API Articles; o código não concede esse acesso nem altera o plano do X. As Consumer Keys continuam resolvidas por perfil/workspace, como nos tweets.
2. Personalize o canal no compositor, selecione **Artigo** e preencha o título. Insira imagens próprias no corpo ou como anexos; a capa é opcional. Vídeos são recusados.
3. Escolha **Salvar rascunho no X** ou **Publicar artigo**. A primeira opção cria um rascunho na conta do X, sem tweet público. O botão de rascunho local do MultiPost continua guardando somente na aplicação. Agendar uma dessas ações significa executá-la na data escolhida.
4. Um artigo salvo como rascunho no X não pode ter respostas. Artigos publicados podem ter respostas como tweets; cada resposta mantém seus limites de texto e até quatro imagens. O corpo do artigo tem limite interno de 100.000 caracteres; títulos até 1.000 e imagens até 32, incluindo a capa. Os contratos de API/MCP também aplicam seus limites de tamanho bruto de mensagem.

O formato de artigo está disponível apenas na conexão nativa. Zernio continua com post comum; uma seleção antiga incompatível pode ser removida no editor. As validações também ocorrem em criação, edição/ações do agente e agendamento pelo calendário, usando o provider real do canal. Rascunhos locais preservam conteúdo incompleto, que precisa ser corrigido antes do envio.

## Publicação e falhas

O provider prepara as imagens, cria o rascunho em `/2/articles/draft` e, quando solicitado, publica em `/2/articles/{id}/publish`. IDs são tratados como strings para não perder precisão. O retorno de uma publicação usa o ID do tweet criado; rascunho aponta para a área de artigos do X. Um rascunho enviado com sucesso aparece como enviado/publicado no calendário do MultiPost, embora permaneça privado no X.

Uploads usam JPEG e categoria `tweet_image`; fotos de entrada têm teto de 20 MB, limite de pixels e saída de até 5 MB. Arquivos locais são confinados pelo caminho real ao diretório configurado, inclusive contra symlinks externos. Mídia remota deve pertencer à instância/bucket e passa por download com proteção SSRF e limite de bytes. Não há fallback para o diretório da aplicação quando `UPLOAD_DIRECTORY` estiver ausente.

As chamadas de criação e publicação não fazem retry de rede automaticamente. Respostas com erros, sem ID ou ambíguas encerram o envio e orientam conferir os artigos no X. Se o rascunho foi confirmado e a publicação falhou, seu ID/URL são preservados com `PublishedWithError`; o post termina em erro e a republicação exige intenção explícita. Tokens, segredos e erros crus do provider não são incluídos nessas mensagens.

Essa proteção cobre **falhas capturadas**. O porte mantém os workflows existentes: um encerramento abrupto entre o aceite remoto e a gravação do resultado ainda pode deixar o desfecho desconhecido. Não há garantia de exatamente uma criação diante de crash; confira o X antes de republicar um envio incerto. Não foi realizada publicação real na validação local.

## API e MCP

Settings do artigo:

```json
{
  "__type": "x",
  "post_type": "article",
  "article_title": "Meu artigo",
  "article_status": "published",
  "article_cover": { "id": "ID-DA-MIDIA", "path": "https://SEU-DOMINIO/uploads/capa.jpg" }
}
```

Use o conteúdo HTML na primeira mensagem. Imagens inline precisam ter URL da biblioteca da instância. `article_status: "draft"` envia o rascunho para o X. Os endpoints de capabilities anunciam `articleMaxLength` separadamente do limite dos tweets; não há endpoint público novo, migração Prisma ou nova variável de ambiente.

Referências: [visão geral](https://docs.x.com/x-api/articles/introduction), [criar draft](https://docs.x.com/x-api/articles/create-draft-article), [publicar](https://docs.x.com/x-api/articles/publish-article).
