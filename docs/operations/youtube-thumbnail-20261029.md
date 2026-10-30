# Thumbnail do YouTube — diagnóstico e correção (29/10/2026)

## Achados confirmados

- VideoFrame sempre exibia o vídeo em 0,1 segundo e não recebia a imagem salva. O editor, o painel de configurações e a biblioteca usavam esse componente. A prévia maior do YouTube também reproduzia apenas o vídeo.
- O seletor atribuía currentTime e permitia capturar antes de seeked. O canvas podia copiar o quadro anterior com o timestamp da posição nova.
- Upload e salvamento de metadados não verificavam HTTP ok. Uma recusa podia fechar o modal e parecer sucesso, mantendo a informação antiga.
- Zero era convertido em null ao reabrir; limpar a capa não limpava o timestamp.

## Comparação com upstream e publicação

Foi atualizado o ref upstream/main via fetch; a versão consultada foi `64f00fd6`. O upstream ainda mantém os problemas de preview/captura examinados. O porte #2285/#2295/#2302 contém o envio de imagem para o YouTube; não foi identificada uma chamada faltante a thumbnails.set.

O payload do composer e updateMedia preservam thumbnail; as activities V102/V112 encaminham a mídia. O provider usa `settings.thumbnail.path` quando presente (compatibilidade com posts antigos), senão `media[0].thumbnail`. A prévia agora segue a mesma prioridade. Há aviso e ação Remover na configuração específica do YouTube.

A falha do vídeo de produção relatado ainda não foi atribuída a uma causa: foi solicitado o link para distinguir salvamento recusado, override antigo, resultado da API e comportamento da plataforma. Não houve publicação nem alteração de vídeo real durante estes testes.

## Correção

VideoFrame mostra a thumbnail salva quando estático e usa poster quando há reprodução explícita. Os consumidores passam a imagem atual. A captura aguarda seeked e dados do quadro; erro/timeout não gera imagem antiga. O save confere as duas respostas e a imagem retornada, mantém o modal em erro e impede clique duplo. Nenhuma regra de envio do provider foi alterada.

## Referências oficiais

A [API thumbnails.set](https://developers.google.com/youtube/data/reference/rest/v3/thumbnails/set) envia uma imagem para um vídeo e pode recusar a operação por falta de permissão ou imagem inválida. A [ajuda do YouTube](https://support.google.com/youtube/answer/72431?hl=pt-BR) distingue Shorts, verificação da conta e superfícies de exibição; também informa que mudanças podem demorar a aparecer. Essas possibilidades não substituem a análise do post concreto.

## Validação

- 39 testes direcionados passaram: 17 Vitest (preview, captura e salvamento) + 22 Jest (mapeamento e provider). O provider foi mockado: nenhuma chamada de publicação ao Google foi executada.
- Typecheck e build de produção do frontend passaram. O painel de teste temporário foi removido antes do build final.
- Navegador com componentes reais e API local simulada: vídeo de 4 segundos começando vermelho e terminando azul. Seleção do último quadro gerou thumbnailTimestamp 3999; o JPEG enviado ficou azul (RGB médio 0/0/255), enquanto o quadro inicial era vermelho (254/0/0). Preview atualizou para a imagem enviada e o modal reabriu preservando a seleção.
- HTTP 500 no save manteve o modal aberto e não expôs o corpo privado do erro. Limpar enviou thumbnail vazia e timestamp null, voltando ao preview padrão do vídeo.
- Revisão de código sem bloqueadores remanescentes; defaults de áudio/reprodução da galeria preservados e o fallback da prévia do YouTube continua mudo/em loop.
- Servidores/rotas temporários de teste foram encerrados/removidos. Produção e vídeos publicados não foram alterados.
- Node local 22.22.3, abaixo do mínimo 22.23.4 declarado pelo projeto; repetir os checks de release no runtime declarado. Lint mantém a limitação de configuração já diagnosticada nesta sessão.

Para fechar o diagnóstico do incidente de produção ainda é necessário o link do vídeo ou post relatado. O conserto local não é confirmação de que a thumbnail de um vídeo já publicado foi alterada.
