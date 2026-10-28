# Provas concluídas: agentes e Dark Post com vídeo

Preparação e provas em 28/10/2026. **As duas provas foram concluídas; consolidação na main iniciada após confirmação humana.** Testes reais exclusivamente no perfil Escorpiano e na Página Escorpião Veneno. Nenhuma campanha foi publicada ou ativada pelo agente para concluir este roteiro.

## Situação atual — 28/10, após confirmação do VIDEODARK28

Prova REST/MCP concluída no Escorpiano: criação, edição cruzada e ativa, cancelamento/reagendamento, publicação dos dois destinos, interações reais e recebimento único confirmado pelo responsável para Instagram, Facebook e Messenger. As três regras temporárias estão pausadas, com IDs e históricos preservados. Resumos e detalhes das novas execuções coincidiram entre REST e MCP; o painel também foi conferido.

A correção visual do Reel passou 27 testes e conferência no navegador, sem mudar vínculos/execução. No teste intermediário VIDEO28, o vídeo gerado pelo Gerenciador `122322698150221279` respondeu uma única vez, mas retornou `is_published=true`. Por isso a consolidação foi aguardada até a prova estrita seguinte, agora concluída. Regra intermediária pausada; nenhum anúncio foi publicado pelo agente.

Nova tentativa VIDEODARK28: o rascunho editorial foi localizado após a autenticação, mas sua referência não é acessível como Page Post. Uma criação separada pela API da Página com `published=false`/`ADS_POST` gerou vídeo `1927476588631377` e Page Post `271852286004401_122322703106221279`; a Meta confirmou `published=false` no vídeo e `is_published=false` no post, ambos pertencentes ao Escorpiano. Um comentário do perfil pessoal Maicon Ramos gerou uma execução e uma DM; o responsável confirmou recebimento único com botão. API/MCP coincidiram, o post permaneceu não publicado e a regra foi pausada. Cinco regras temporárias desta rodada estão pausadas. Gate estrito concluído; visibilidade a contas externas não comprovada, sem veiculação paga. Consolidação autorizada anteriormente agora em andamento.

## 1. Acesso para testar API e MCP

No ambiente local de desenvolvimento, foi preparado `.secrets/agent-e2e.env`, ignorado pelo Git e com permissão 600. Preencha localmente, sem enviar chaves no chat:

- `MULTIPOST_E2E_API_BASE_URL`: base REST da instância, terminando em `/public/v1`.
- `MULTIPOST_E2E_MCP_URL`: URL do transporte MCP, terminando em `/mcp`.
- `MULTIPOST_E2E_API_KEY`: chave **do perfil Escorpiano**, criada nas configurações de API desse perfil.
- `MULTIPOST_E2E_MCP_TOKEN`: pode ser a mesma chave de perfil. Não é o access token da Meta.
- `MULTIPOST_E2E_PROFILE_ID`: ID interno do perfil Escorpiano, se disponível; será conferido com a descoberta antes de qualquer escrita.
- `MULTIPOST_E2E_VIDEO_PATH`: opcional; caminho de um vídeo local autorizado para publicar no teste de agendamento. O arquivo neutro abaixo pode ser usado.

Avise quando estiver preenchido. O agente confere apenas presença, autentica REST e MCP, descobre os canais e confirma os destinos antes de escrever. Uma chave de organização sem perfil resolve Default nas fachadas novas; por isso a chave do Escorpiano é a opção recomendada para esta prova. Não alterar credenciais das redes.

### Sequência de aceite por agente

1. Consultar capacidades, schemas dos destinos e canais pelo REST e pelo MCP; conferir que apontam para os mesmos canais do Escorpiano. Conferir as novas ferramentas de histórico no catálogo.
2. Criar destinos de teste com identificador único no nome/texto, em Instagram e Facebook, agendados com margem para editar. Guardar IDs internos de cada destino, versões retornadas e horários.
3. Criar uma automação por destino em `postMode=scheduled`, vinculada ao `Post.id` correto, palavra-chave exclusiva e resposta privada de teste. Descobrir e validar a configuração antes de ativar. Não usar `next_publication` nem uma regra existente como fixture.
4. Editar conteúdo e reagendar os mesmos IDs por uma interface; consultar pela outra e conferir preservação de mídia, vínculo, campos omitidos e revisão. Exercitar patch e status das automações com snapshot de concorrência, sem duplicar regras/posts. Erro de versão exige reler.
5. Após a publicação autorizada, conferir IDs remotos de cada destino, vínculo exato e retirada da etiqueta Agendado. Não republicar para corrigir apenas metadados.
6. Com outra conta, o responsável comenta a palavra de teste em cada publicação. Correlacionar evento → execução → etapas/entrega. Consultar os mesmos detalhes pela UI, REST e MCP, inclusive filtros/cursor. Confirmar recebimento de **uma única resposta** com o responsável; aceite da Meta não substitui essa confirmação.
7. Pausar somente as regras criadas para o teste. Guardar IDs, horários, versões e resultados sanitizados; preservar histórico. Não excluir posts/regras anteriores nem manter uma regra genérica ativa por engano.

Teste de autenticação ou catálogo isolado não conclui essa sequência. Se não houver credenciais ou se faltar o comentário/recebimento humano, registrar a etapa pendente sem marcar a prova como concluída.

## 2. Vídeo exclusivo de Dark Post

O Reel publicado `1123082713461960`, vinculado ao Page Post `122322300272221279`, já foi validado em 26/10. Ele **não** comprova o caso de um vídeo novo salvo como publicação não publicada. A prova com imagem não publicada também foi concluída; não precisa ser repetida.

Foi preparado um MP4 neutro de 8 segundos, vertical 720×1280, H.264, sem áudio ou material de terceiros, com a palavra **VIDEO28**. Artefato local desta rodada: `output/facebook-dark-video-20261028/teste-dark-post-video28.mp4` (não versionado). A geração do arquivo não cria post nem anúncio.

### Passo a passo no Gerenciador de Anúncios

O caminho abaixo foi observado nesta conta em 26/10; a disponibilidade para vídeo deve ser conferida no rascunho atual.

1. Abra o Gerenciador de Anúncios na conta de anúncios usada no teste anterior. Crie um novo rascunho de anúncio, preservando os anúncios anteriores.
2. Na **Identidade**, selecione e confira **Escorpião Veneno**. Não selecione outra Página ou Instagram. A integração Facebook do MultiPost é `cmvi6us6q0005pm090b98kalb`; o ID Graph confirmado da Página é `271852286004401`. IDs/aliases visíveis no permalink podem ser diferentes.
3. Vá a **Configuração do anúncio → Usar post existente → Criativo do anúncio → Criar post**.
4. Adicione o MP4 novo e o texto: **Teste exclusivo de vídeo MultiPost — comente VIDEO28**. Não use “selecionar publicação existente” para reutilizar o Reel publicado.
5. Use **Salvar post não publicado**, se essa opção estiver disponível para vídeo. Deixe campanha/conjunto/anúncio em rascunho. Não clique no botão final **Publicar** do Gerenciador, nem altere orçamento ou ative campanha.
6. Copie a **identificação do post do Facebook** exibida no criativo. Precisamos do ID da publicação; ID do anúncio/campanha, ID de vídeo e link `adspreview` não são equivalentes. Envie o ID ou permalink aqui; ainda não comente.
7. Se não houver a opção de salvar vídeo não publicado ou se o rascunho não gerar um ID de publicação consultável, pare nesse ponto e informe o que apareceu. Não publicar anúncio para contornar a limitação. A prévia iOS não é requisito para esta prova.

### O que o agente fará depois do ID

- Resolver a referência na integração exata do Escorpiano e conferir propriedade, ID retornado, tipo e prévia/permalink. Não adivinhar IDs compostos. Registrar a evidência de não publicado disponível; não inferir esse estado apenas por ausência na galeria.
- Preparar e ativar uma regra temporária **específica** somente para esse post, palavra-chave exata `VIDEO28`, uma resposta privada e nenhum gatilho genérico. Conferir conflitos existentes antes de ativar.
- Avisar para comentar uma vez com outra conta, em comentário novo de primeiro nível. Comparar webhook, execução, ledger e resposta, sem reenvio automático em resultado `UNKNOWN`.
- Pedir confirmação de uma única resposta recebida, pausar somente a regra temporária e atualizar este registro com os IDs/resultados sanitizados.

## Gates antes da main

- Testes automatizados e build aprovados, revisões de código/segurança e contratos atualizados.
- Prova REST/MCP completa com os mesmos posts/automações, incluindo edição/reagendamento e resposta confirmada.
- Prova do vídeo novo não publicado confirmada; ou decisão expressa do usuário sobre um bloqueio externo identificado.
- Apenas então sincronizar main, resolver conflitos, abrir/revisar PR e integrar. Preparar arquivos ou passar testes unitários não antecipa esse gate.

## Registro inicial, antes do preenchimento do acesso

28/10: histórico REST/MCP implementado, testes direcionados aprovados, build e reinício local concluídos sem imagem nova. Rotas/schemas verificados no Swagger local e autenticação anônima recusada. Vídeo local preparado e inspecionado. As duas provas externas continuam pendentes: credenciais de perfil para REST/MCP e ID de um vídeo novo salvo como post não publicado. Nenhuma campanha, publicação, comentário ou mensagem foi criada nesta rodada. Main não consolidada.

### Acesso e prova cruzada iniciados — 28/10, 08h29–08h35 (Brasília)

- Chave fornecida pelo responsável autenticou REST e MCP. Ambos retornaram exclusivamente os canais Escorpiano Instagram `cmvi6mect0001pm099jwtmap0` e Facebook `cmvi6us6q0005pm090b98kalb`. Catálogo MCP contém 29 ferramentas, incluindo as duas novas de histórico. Sem impressão de credenciais.
- Prova identificada como `E2E28-mvs17xqm`. Vídeo neutro usado somente nos dois destinos técnicos: Instagram `cmvs1915a0000pa1r7fzh5tbk` criado por REST; Facebook `cmvs1919w0001pa1rahdez4w9` criado por MCP. Edição cruzada de texto/data conservou ID, mídia e settings. Cancelamento → DRAFT → reagendamento por interfaces opostas conservou IDs e vínculo. Agendados para 08h36min39s. Publicação e comentário ainda aguardam conferência.
- Automações específicas: Instagram `ddc23d5d-9c06-4fec-8ed5-870d400fc4fd` (criada MCP/editada REST/ativada MCP), Facebook `234657ac-28dd-4ed9-83c2-f979b9f7987a` (criada REST/editada MCP/ativada REST). Palavra exata `AGENTE28`; variações públicas, botão e scheduledPostId preservados. Nenhum fluxo anterior alterado.
- Messenger temporário `97bccbe0-66d0-4e0f-98f6-b9f062d8c129`, prioridade 30, palavra exata `AGENTEDM28`: criado REST, editado MCP, ativado REST. Mensagem real ainda pendente.
- Tentativa de sobrescrever o perfil por REST recusada com 403; identidade em input MCP recusada. Patch de post com snapshot antigo recusado com 409, sem alterar a versão atual. Histórico de registros existentes V1/V2 e seus detalhes iguais entre REST e MCP; cursor de V2 avançou sem repetir o item anterior. Essas leituras não substituem a prova das novas execuções.
- Para Dark Post, responsável escolheu `/Users/maiconramos/Downloads/demo-colagem.mp4`: H.264/AAC, 1080×1920, 7,402 s, 22.829.226 bytes. Arquivo original preservado; não usado nos posts técnicos orgânicos.
- Criado rascunho novo de anúncio `120249785004740545`, nome **Teste VIDEO28 · Dark vídeo · Escorpiano · NÃO PUBLICAR**, desativado. Página Escorpião Veneno confirmada na identidade. Anúncio original `120249757992320545` preservado. A primeira duplicação falhou com o Gerenciador desconectado; após atualizar a conexão, a segunda criou um único rascunho novo. Nenhuma campanha/anúncio foi publicado e nenhum orçamento foi alterado.
- Modal Criar post aberto com texto “Teste exclusivo de vídeo MultiPost — comente VIDEO28”. Upload automático do arquivo fornecido foi recusado pela extensão Chrome por faltar acesso a arquivos locais. A permissão não foi alterada; seleção manual do vídeo foi solicitada ao responsável. Até aqui nenhum novo Page Post de vídeo foi salvo. Evidência local em `output/facebook-dark-video-20261028/rascunho-video28-upload.png`.

### Publicação e conferência complementar — 28/10, 08h37–08h43

- Destinos publicados pelo reagendamento, sem publish_now: Instagram `18193889851400155`, [Reel Instagram](https://www.instagram.com/reel/DfCVyC3htLh/); Facebook `1396346385586657`, [Reel Facebook](https://www.facebook.com/reel/1396346385586657). Ambos PUBLISHED, sem erro e com os IDs locais preservados. Facebook na listagem remota também retornou Page Post `271852286004401_122322697586221279` com o permalink desse mesmo Reel.
- As três automações temporárias também foram editadas já ACTIVE, com leitura prévia de versão. Permaneceram ACTIVE, no mesmo ID e com alvo/palavra/botão/variações conservados. Não houve PAUSE_BEFORE_EDIT.
- Leitura histórica existente do Messenger também conferida por REST e MCP: mesmo resumo/detalhe, channel=messenger, status=completed. Nenhum reenvio.
- Na conferência real do editor, a etiqueta Agendado desapareceu. Foi encontrada duplicação visual por ID de vídeo versus ID composto antes de resolver aliases. Corrigida somente no frontend, por helper de identidade do permalink HTTPS Facebook, sem mudar snapshot, IDs ou execução. RED reproduzido; GREEN27casos/2suítes. Revisões de código e segurança sem bloqueadores.
- Comentário de teste no Facebook solicitado ao responsável, somente no Reel acima com AGENTE28. Confirmação e novas execuções ainda pendentes. Instagram e Messenger temporários estão prontos para os respectivos testes humanos. Seleção manual do demo-colagem no rascunho Dark permanece pendente; não foi publicado anúncio.

### Prova de respostas por agente concluída — 28/10, 08h46–08h49

- Facebook: execução `e7b84928-7609-4f5e-acd7-307e3d91bdef`, uma etapa pública aceita às 08h46min12s e uma privada aceita às 08h46min15s. O usuário confirmou uma única mensagem recebida com o botão Abrir MultiPost. Regra pausada por MCP às 08h47min06s. O target congelou os IDs comprovados `271852286004401_122322697586221279` e `1396346385586657`, sem trocar o vínculo interno.
- Instagram: execução `8faf7e27-4418-4ef9-b88b-967be5687fab`, concluída em 08h47; log V1 de gatilho, resposta pública e preparação de DM. Sem inferir entrega pelo log: o responsável confirmou uma única mensagem recebida com o botão. Regra pausada por REST após conferir a execução.
- Messenger: execução `dbda073d-d263-4262-ace5-99830b95e472`, uma etapa SEND_DM aceita às 08h49min14s. O responsável confirmou uma única resposta com o botão. Regra pausada por MCP.
- Todas tiveram apenas uma execução retornada, sem página adicional; páginas e detalhes novos comparados entre REST e MCP. Drawer do painel confirmou a interação AGENTE28 e as duas etapas aceitas no Facebook. Não houve replay ou envio manual. Nenhuma regra anterior foi alterada.
- Dark vídeo: o responsável informou ter selecionado o arquivo e o Gerenciador exibiu “Seu post de vídeo está sendo processado”. O rascunho permanece desligado e ainda mostra a referência anterior enquanto se confere o novo post. Não assumir que seleção de arquivo ou toast comprova salvamento como não publicado.

### Conferência do candidato a Dark vídeo

- Encontrado o post `271852286004401_122322698150221279`, texto “teste video 28/10”, [Reel correspondente](https://www.facebook.com/reel/1123104000304848/). Consulta somente de leitura à API da Meta confirmou a Página Escorpião Veneno e `is_published=true`. Portanto, esse candidato não será usado como prova de vídeo não publicado.
- Solicitado ao responsável esclarecer se utilizou “Salvar post não publicado” no rascunho VIDEO28 ou publicou o vídeo diretamente na Página. Nenhum anúncio foi publicado para contornar essa pendência e nenhuma regra VIDEO28 foi ativada para o candidato.
- Recebimento único do Messenger confirmado pelo responsável; nova leitura REST confirmou PAUSED nas três regras temporárias (Instagram, Facebook e Messenger). Históricos preservados.
- Esclarecimento posterior do responsável: o Dark Post ainda está em processamento. A captura `Screenshot 2026-10-28 at 08.46.39.png` mostra o aviso “Seu post de vídeo está sendo processado”. Esse aviso não informa o ID nem comprova o estado final publicado/não publicado. Aguardar o resultado desse upload e conferir sua referência exata; não deduzir que corresponde ao Reel publicado encontrado na galeria e não repetir o upload enquanto houver processamento.

### ID informado após processamento — 28/10

- O responsável identificou o resultado do upload como `122322698150221279`. Nova consulta de leitura à Meta retornou `271852286004401_122322698150221279`, Página `271852286004401`, permalink do Reel `1123104000304848` e novamente `is_published=true`. O resolvedor público do MultiPost comprovou a mesma propriedade e referência, com miniatura.
- A associação com o upload foi informada pelo responsável; a API continua classificando o post como publicado. A prova seguinte verificará comentários e DM desse vídeo criado pelo caminho do Gerenciador, sem classificar o resultado como prova de vídeo não publicado.
- Preparar regra nova específica para esse ID, correspondência exata `VIDEO28`, somente DM e botão. As regras ativas existentes no Escorpiano apontam para outras publicações/agendamentos; não ampliar escopo nem alterá-las. Após o comentário e confirmação de recebimento único, pausar somente a regra nova. O gate de vídeo não publicado permanece aberto ou depende de decisão expressa sobre a limitação observada.
- Às 08h57 (Brasília), conexão retornou `ready=true`. Regra `cc454412-98ae-47a5-b055-f2efc2e0a622` criada e relida ACTIVE, revisão 2, somente no Page Post acima. Palavra exata `VIDEO28`; uma DM com botão “Abrir MultiPost”, sem resposta pública. Comentário humano e recebimento ainda pendentes.
- Após o responsável comentar VIDEO28, execução `85781750-7860-40c1-bf24-49cbcaa29383` concluída às 09h17min46s (Brasília), com uma única etapa SEND_DM aceita pela Meta às 09h17min46,502s. Referência técnica coincide com o Page Post exato. Resumo e detalhe iguais entre REST e MCP; uma execução na lista, sem página adicional. Regra pausada via REST, revisão 3, preservando histórico. Recebimento único com botão ainda depende de confirmação humana; aceite da Meta não equivale a entrega comprovada. A ressalva `is_published=true` permanece.
- Confirmação humana posterior: recebeu uma única mensagem com o botão “Abrir MultiPost”. Prova funcional VIDEO28 concluída; nova leitura confirma PAUSED. Não equiparar esse resultado a vídeo não publicado, pois a Meta informa `is_published=true`. Decisão sobre consolidar com essa ressalva ou manter o gate estrito ainda pendente.
- Decisão posterior do responsável: **aguardar teste de vídeo realmente não publicado**. Não consolidar na main com ressalva. Manter fixtures anteriores pausadas e preparar o caminho de criação sem publicar anúncio ou alterar orçamento.

### Preparação de nova tentativa — VIDEODARK28

- Reaberto **Criar post** no mesmo anúncio em rascunho `120249785004740545`, ainda desativado, Escorpião Veneno. Texto preparado: “Teste exclusivo de vídeo não publicado — comente VIDEODARK28”. Nenhuma publicação foi salva nessa tentativa.
- O formulário sem mídia mostra o botão principal **Salvar post não publicado**; o menu **Ações** oferece separadamente **Publicar**, **Agendar** e **Usar data retroativa**. Menu apenas inspecionado e fechado. É necessário conferir novamente esse comportamento após anexar o vídeo, antes de salvar.
- Upload automático segue indisponível porque a extensão Chrome não tem acesso a arquivos locais. A permissão não foi ampliada. Próxima etapa humana: adicionar `/Users/maiconramos/Downloads/demo-colagem.mp4` nesse formulário, sem clicar em salvar/publicar; então o agente confere o estado e utiliza somente o salvamento não publicado, caso continue disponível. Após processamento, consultar o ID exato e `is_published` antes de criar/ativar outra regra.
- Evidência local: `output/facebook-dark-video-20261028/formulario-nao-publicado-videodark28.png`. Main/PR/merge retidos conforme decisão do responsável.
- O responsável anexou novamente `demo-colagem.mp4`. O upload abriu um segundo formulário “Carregar vídeo”, diferente do modal original: após “Avançar”, **Publicar agora** veio selecionado, com Feed/Watch habilitados. Isso é compatível com o primeiro vídeo ter sido publicado, mas não comprova quais opções foram usadas naquela tentativa.
- Nesta tentativa o agente selecionou explicitamente **Salvar como rascunho**; “Publicar agora” ficou desmarcado e o botão final passou a “Salvar como rascunho”. Página Escorpião Veneno conferida; nenhuma outra Página foi selecionada. Salvamento iniciado por esse botão, sem clicar em Publicar nem ativar anúncio. Aguardar processamento e comprovar o ID/estado retornado antes da regra.
- Salvamento confirmado no navegador: **“Seu post de vídeo foi salvo. Gerencie o seu post na aba Pré-publicados.”** Evidência local `output/facebook-dark-video-20261028/video-salvo-rascunho.png`. Essa confirmação não substitui a consulta `is_published` do ID correto.
- A galeria de seleção do anúncio ainda não listou VIDEODARK28. Consulta de leitura aos vídeos da Página também não retornou correspondência com o marcador; nenhuma inferência sobre exclusão/falha. Pela ferramenta **Posts da Página** (`business.facebook.com/content_management/`), a Meta pediu reautenticação com 2FA. Aba preservada para o responsável concluir diretamente, sem fornecer código no chat. Não repetir upload nem publicar vídeo/anúncio para contornar esse ponto.
- Após autenticação concluída pelo responsável, o conteúdo atual do Business Suite mostrou VIDEODARK28 em **Rascunhos**, na Página Escorpião Veneno. Ao abrir para leitura, URL identifica `business_content_id=1804583193996011`; esse ID não foi acessível pelo token da Página como post nem vídeo (`code=100`, `subcode=33`). Não tratar o ID do rascunho editorial como Page Post nem ativar uma regra com referência inventada.
- Alternativa de preparação: o [SDK oficial da Meta](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/page.py) declara `Page.create_video`, endpoint `/videos`, parâmetros `published` boolean e `unpublished_content_type`; o [enum oficial](https://github.com/facebook/facebook-php-business-sdk/blob/main/src/FacebookAds/Object/Values/AdVideoUnpublishedContentTypeValues.php) distingue `ADS_POST` de `DRAFT`. Tentar uma única criação de vídeo de anúncio pelo canal exato Escorpiano, com `published=false` e `unpublished_content_type=ADS_POST`, usando somente o MP4 autorizado. Sem campanha, conjunto, anúncio, orçamento ou concessão de permissões. Se a API recusar, registrar o código sanitizado sem ampliar acesso; se o resultado for incerto, não repetir automaticamente. Confirmar o estado e Page Post retornado antes de qualquer automação.
- Criação única pela API retornou vídeo `1927476588631377`, título “Teste Dark vídeo API VIDEODARK28”. Leitura posterior confirmou `from.id=271852286004401`, `published=false`, `video_status=ready`, upload/processamento concluídos. O campo `post_id` do vídeo retornou `122322703106221279`; consulta desse Page Post confirmou `is_published=false`, propriedade e legenda VIDEODARK28. [Permalink retornado pela Meta](https://www.facebook.com/reel/1927476588631377/). Nenhum POST de campanha/conjunto/anúncio foi feito; token existente usado apenas em memória, sem alteração de permissões.
- O resolvedor MultiPost confirmou o ID numérico do **post** como `271852286004401_122322703106221279`. Usar essa referência comprovada na regra. A consulta pelo ID do vídeo devolveu uma referência distinta; não substituir o Page Post pela ID de vídeo nem inferir equivalência sem evidência de webhook.
- Conexão pronta e regra `d54d6fad-806f-4bd4-83b2-0f8c9060edb6` relida ACTIVE, revisão 2: somente Page Post `271852286004401_122322703106221279`, palavra exata `VIDEODARK28`, uma DM e botão “Abrir MultiPost”, sem resposta pública. Regra VIDEO28 anterior permanece pausada.
- Permalink aberto no navegador mostrou Escorpião Veneno, legenda VIDEODARK28, sem comentários e caixa “Comente como Maicon Ramos”; o link de insights também referencia `122322703106221279`. Evidência local `output/facebook-dark-video-20261028/videodark28-comentarios.png`. Solicitar comentário humano novo de primeiro nível; não comentar pelo agente. Recebimento e nova leitura do estado após o teste ainda pendentes.
- O responsável relatou “Esta página não está disponível no momento” ao abrir com outra conta. Nova leitura mantém `is_published=false`; histórico da regra ainda sem execução. No navegador autenticado como perfil pessoal Maicon Ramos, o mesmo permalink continua exibindo a legenda e a caixa “Comente como Maicon Ramos”, sem comentários. Usar esse perfil pessoal para testar o webhook/DM é diferente de comentar como a Página; isso não comprova visibilidade a contas externas. Não publicar vídeo/anúncio nem ampliar permissões para contornar a indisponibilidade externa. Solicitar ao responsável o comentário nessa sessão pessoal acessível.
- O responsável comentou como Maicon Ramos. Execução `614764cf-f3ed-439d-9cd6-23fdf27b9b65` concluída em 28/10 às 09h37min46s (Brasília), uma etapa SEND_DM aceita às 09h37min46,254s, referência técnica exata `271852286004401_122322703106221279`. Lista com uma execução e sem próxima página; resumo e detalhe iguais por REST/MCP. Regra pausada via REST, revisão 3. Falta confirmação humana de uma única mensagem recebida com botão; não concluir o gate apenas pelo aceite da Meta.
- Nova leitura da Meta após a execução manteve `is_published=false` e a mesma Página/permalink. O comentário e a resposta não publicaram o vídeo. Acesso por conta externa não foi comprovado; o teste usa perfil pessoal com acesso de gerenciamento, distinto da Página.
- O responsável confirmou **uma única mensagem com o botão Abrir MultiPost**. Prova estrita concluída para este Page Post de vídeo não publicado; sem extrapolar para acesso universal nem outros formatos. A condição solicitada antes da consolidação foi atendida.

### Consolidação após aceite

- Backup temporário dos 87 arquivos da entrega e diff anterior em `.secrets/consolidation-20261028/`, fora do Git. Branch `codex/automation-editor-journey` sincronizada por fast-forward com `origin/main` em `e06ab2ce`, incorporando 13 commits anteriores à entrega. Nenhum push na main realizado nesta etapa.
- Restauração da entrega encontrou conflito somente nas traduções pt/en. Resolução preservou as 2.556 chaves atuais da main por idioma e aplicou as 173 chaves alteradas/adicionadas das automações, sem descartar chaves de outros recursos. Catálogo MCP preserva a ferramenta de mídia chegada pela main e as ferramentas de histórico desta entrega. Verificações finais e revisão do diff integrado antes de PR/merge.
- Verificações finais após sincronização e reparo da guarda Story: **279 testes UI em 37 arquivos** e **99 testes Jest em 8 suítes** aprovados. TypeScript frontend e build de produção frontend aprovados. Backend compilado com o mesmo `tsconfig.build.json` do Nest em saída isolada `/tmp`, sem substituir os artefatos do app em execução. Prisma Client regenerado somente no host para refletir o schema da main; sem aplicar migração, reiniciar o backend ou criar imagem Docker nesta consolidação.
- Revisões finais de código (incluindo reparo Story), segurança, documentação e aceitação macro aprovadas. Todas as 2.727 chaves pt/en têm paridade. Navegador após sincronização confirmou regra VIDEODARK28 pausada, histórico com uma execução concluída, detalhe com uma DM aceita e mensagem correta; console sem erros/avisos. Evidência local `output/facebook-dark-video-20261028/historico-videodark28-validado.png`. Nenhum novo envio durante essa conferência.
