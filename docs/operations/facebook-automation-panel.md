# Facebook: autorizar uma Página pelo painel

Este guia descreve a configuração, o diagnóstico e a prova de resposta privada pelo painel. O criador compartilhado está implementado sob habilitação explícita; veja o [manual de criação e execução](facebook-shared-automations.md). O estado “pronto para testar o recebimento” confirma autorização, callback e inscrição; não significa que uma automação já envia mensagens.

## O que o aluno precisa fazer

Em **Configurações → Credenciais**, expanda o box **Meta** e escolha a aba **Facebook**, **Instagram**, **Threads**, **Messenger** ou **Usuário de sistema**. As cinco abas têm ícone e largura igual, com rolagem horizontal em áreas estreitas. A aba selecionada se une visualmente ao painel de configurações, sem repetir o ícone e o nome do produto abaixo; o cabeçalho do box mostra apenas a identificação Meta e seu estado. Os formulários mantêm seus contratos; a troca de aba preserva os campos em edição e não salva credenciais. Na configuração inicial, o botão **Salvar credenciais** continua único para o conjunto. Links diretos de automação abrem a aba correspondente. Também é possível navegar entre abas com as setas, Home e End.

### Ajuda e diagnóstico padronizados

Cada aba oferece **Ajuda**, com o mesmo ícone, estilo e posição no cabeçalho. O drawer tem duas seções: **Como configurar**, aberta inicialmente, e **Diagnóstico**. Tooltips continuam reservados a explicações breves de campos. Escape, botão de fechar, rodapé e clique no fundo fecham o drawer; Tab/Shift+Tab permanecem no painel, e as abas internas aceitam setas, Home e End.

- **Facebook:** seleção da Página, status e ações continuam na tela. Datas, permissões, validade e recibo ficam no diagnóstico. A prova de resposta privada mostra o resultado resumido, com IDs e conteúdo em **Ver detalhes do teste**; abrir ajuda não envia mensagens nem inicia verificações na Meta.
- **Messenger:** callback e token de verificação permanecem na aba. O diagnóstico diferencia dados disponíveis para copiar de webhook efetivamente verificado; a verificação por Página permanece no Facebook.
- **Instagram:** os tokens individuais permanecem no Instagram; orientações e datas registradas vão para a ajuda. “Token cadastrado” indica armazenamento, não validade atual comprovada. A renovação durante o uso não foi alterada nesta entrega.
- **Threads:** a ajuda explica credenciais e URL de retorno. O diagnóstico limita-se ao cadastro do aplicativo; não inventa estado de conexão ou eventos.
- **Usuário de sistema:** o formulário antes mostrado dentro do Instagram tem aba própria, inclusive link direto `?tab=credentials&metaTab=system-user`. O token permanece nas mesmas credenciais Meta do perfil. A lista de ativos é apenas o resultado registrado da última validação. Não há migração de dados nem conexão automática de ativos. Para autorizar comentários do Facebook com esse token, aplique-o à Página selecionada conforme o [guia de usuário de sistema](facebook-system-user-authorization.md).

Instagram e Usuário de sistema compartilham uma leitura SWR de `/credentials/facebook/messaging-tokens`, com cache separado por organização/perfil, mantendo rascunhos separados. O POST de sistema envia somente `metaSystemUserToken`; o de Instagram envia somente `instagramTokens`, preservando as contas anteriores. A troca de perfil descarta rascunhos e respostas atrasadas; validação de Instagram pendente não inicia a gravação depois da troca. GET/POST enviam `x-expected-org-id` e `x-expected-profile-id`. O backend compara com o contexto autenticado e retorna 409 antes de ler/validar/gravar se outra aba mudou o escopo; os headers nunca selecionam organização/perfil. Nesse caso, a interface pede recarregar, sem repetir automaticamente o envio. Clientes legados sem nenhum dos dois headers mantêm o contrato anterior; o cadastro novo sempre envia os dois. Os headers também estão permitidos no CORS da instalação. Falha de leitura aparece como indisponibilidade, nunca como “nenhum token”. O cadastro de tokens continua exigindo o cadastro inicial das credenciais.

O diagnóstico distingue **última validação**, **cadastro ou renovação do token Instagram**, **vencimento do token** e **acesso aos dados** conforme os dados disponíveis. Não presume token permanente e não faz uma consulta remota só por abrir. A padronização é de interface; não adiciona cron de renovação nem altera o contrato de autorização por Página.

### 1. Preparar o aplicativo Meta

No aplicativo que será usado nesta instalação, adicionar o caso de uso Messenger e disponibilizar as permissões solicitadas. Na homologação atual, `pages_messaging` e `pages_manage_metadata` já aparecem como prontas para teste. Isso não comprova aprovação para uso público; testes devem respeitar os papéis e acessos permitidos pelo aplicativo.

Cadastrar a URL de redirecionamento OAuth mostrada na seção Facebook do MultiPost. Ela termina em `/integrations/social/facebook`. Manter App ID e App Secret salvos no perfil, ou nas credenciais compartilhadas configuradas pelo administrador. A resolução usa as mesmas credenciais efetivas da publicação: perfil, Default compartilhado e variáveis da instalação.

### 2. Selecionar o perfil e conectar a Página

No MultiPost, selecionar o perfil correto. Em **Canais**, conectar a Página Facebook pelo login normal, caso ainda não esteja conectada. Finalizar a seleção da Página: contas que ainda aguardam essa seleção não aparecem na configuração de automações.

Nesta homologação, usar exclusivamente:

- Perfil **Escorpiano**.
- Página **Escorpião Veneno**, ID `271852286004401`.
- Integração `cmvi6us6q0005pm090b98kalb`.
- Aplicativo `841571281566716`.

### 3. Autorizar automações

Há duas opções: login do Facebook (padrão) e usuário de sistema do perfil.
O [guia de usuário de sistema](facebook-system-user-authorization.md) descreve
preparo, aplicação por Página, validade e renovação sem recriar automações.
O procedimento abaixo continua válido para login do Facebook.

Abrir **Configurações → Credenciais → Meta → Facebook → Automação da Página**. Selecionar a Página e clicar em **Autorizar automações**.

Fazer login e aceitar as permissões na Meta. Manter o mesmo usuário, organização e perfil no MultiPost até o retorno. O retorno deve ocorrer em até dez minutos; em caso de cancelamento ou expiração, iniciar novamente pelo botão.

O MultiPost troca o código OAuth, obtém o token da Página selecionada, confere aplicativo, identidade, validade e permissões e armazena a autorização cifrada. O aluno **não gera nem copia access token**. A autorização de automação é independente do token já usado para publicar.

As permissões adicionais incluem `pages_messaging`, `pages_manage_metadata` e `pages_read_user_content`; `pages_read_engagement` já integra a publicação. O login continua solicitando os escopos de publicação existentes. Uma concessão parcial não é tratada como autorização completa.

### Separação entre aplicativo e Página

A aba **Messenger** usa as credenciais salvas no Facebook, sem criar outro provedor ou login. Ela mostra o webhook compartilhado do aplicativo, independentemente da Página selecionada. A aba Facebook mantém seleção, autorização, verificação, ativação e diagnóstico por Página. Trocar de aba não inscreve Páginas nem envia mensagens, e preserva a seleção e os rascunhos. O webhook Instagram continua na aba Instagram, sem migração.

Contrato: `GET /facebook-automations/app/webhook`, privado, política ADMIN e `Cache-Control: no-store`. Resposta: `{ appId, callbackUrl, verifyToken: string | null, authorizationRequired: boolean }`. O serviço resolve a credencial efetiva do perfil e procura autorização compatível apenas entre suas Páginas elegíveis. Sem autorização local, o token fica indisponível e a interface orienta autorizar uma Página no Facebook primeiro. `authorizationRequired: false` significa autorização armazenada compatível; não comprova validade atual ou configuração na Meta. A leitura não chama a Meta, não altera inscrições e não expõe App Secret ou tokens de acesso. Credenciais/callback inválidos mantêm resposta 412. Cache do frontend isolado por organização, perfil e versão da credencial, revalidado ao abrir Messenger.

### 4. Cadastrar o webhook pelo site da Meta

Depois da autorização, abra a aba **Messenger** no MultiPost para exibir **URL de callback do Facebook** e **Token de verificação do webhook**. Esse token serve para validar o callback; não concede acesso à conta.

Na aba Messenger, clicar em **Ajuda → Como configurar** para abrir o drawer lateral. No passo **Abra o webhook na Meta**, usar **Abrir Meta**. O caminho completo fica em **Onde encontro essa opção?**. Copie a URL e o token diretamente no passo **Copie os dados do MultiPost**, sem fechar a ajuda. O token permanece oculto, e **Fechar ajuda** retorna à aba. No layout observado em 22/10/2026, o caminho é **Casos de uso → Messenger from Meta → Configurações da API do Messenger → 1. Configure webhooks**. Nessa seção, copiar a URL de callback e o token de verificação exibidos pelo MultiPost, clicar em **Verificar e salvar** e manter o campo **`feed`** assinado. Nesse layout, não é necessário procurar um seletor chamado “Page” ou “Pages”: a configuração dessa seção já corresponde às Páginas do Facebook. `page` continua sendo o nome técnico usado pela API.

Essa configuração é compartilhada por todas as Páginas que utilizam o mesmo aplicativo. O MultiPost informa quando encontra outro callback e **não o substitui automaticamente**. Conferir o destino existente antes de trocar pelo painel Meta. Não alterar o objeto Instagram ao configurar o objeto Page.

Na instalação de teste atual, os prints de 22/10 mostram o callback antigo `https://localmultipostapi.automacaosemlimites.com.br/public/fb-webhook-proof`, que pertence ao receptor isolado da prova anterior, e `feed` já assinado no aplicativo em v25.0. O painel fornece **`https://localmultipost.automacaosemlimites.com.br/api/public/facebook-automations/841571281566716`**. É esse valor completo que deve ser copiado; não misturar o domínio da API antiga com o caminho novo. A troca manual foi concluída pelo usuário em 22/10, e o callback do produto recebeu o comentário real às 15:26:51. O receptor anterior pode continuar rodando, mas deixa de receber os eventos Page desse aplicativo após a troca.

A seção Meta **2. Gere tokens de acesso** lista Páginas e suas assinaturas individuais. Ela é diferente da assinatura `feed` do aplicativo na seção 1. Não é necessário usar **Gerar** nem **Adicionar assinaturas** nessa seção para a jornada do MultiPost: o login já obtém o token, e o próximo passo inscreve a Página selecionada. Nos prints anteriores à ativação de 22/10, Escorpião Veneno aparecia como **Nenhum campo assinado**, apesar do `feed` do aplicativo estar ativo; são dois níveis distintos da configuração. A ativação pelo produto foi confirmada depois.

### 5. Confirmar o recebimento

Voltar à aba **Facebook**, selecionar a Página e clicar em **Verificar e ativar recebimento** quando houver configuração pendente. Se o recebimento já estiver configurado, **Verificar Página** confere o estado sem alterar inscrições. O aplicativo confere o callback registrado na Meta e acrescenta `feed` à inscrição da Página escolhida, preservando os campos existentes. Outras Páginas e outros aplicativos não são inscritos nem removidos por essa ação.

Quando o callback já está correto, essa conferência/inscrição também é tentada automaticamente ao terminar o OAuth. Falha ou timeout não produz confirmação falsa: o painel exige nova verificação, que consulta o estado remoto antes de decidir se precisa inscrever novamente.

Depois da confirmação, adicionar um comentário novo com outra conta ao post de teste. O painel atualiza o recibo armazenado a cada dez segundos enquanto está visível, sem consultar a Meta nesse polling. O resumo mantém o selo e a indicação de verificação anterior, quando aplicável. A ajuda junto ao selo mostra a data registrada e o último recebimento; as datas completas e os IDs de post e comentário ficam em **Ajuda → Diagnóstico**; não guarda texto nem identificação do autor. Comentários da própria Página, edições e respostas a outros comentários são ignorados nesta etapa conservadora.

O post reservado para a prova é [Inspiração](https://www.facebook.com/share/p/1DsHnUeoAy/), Graph ID `271852286004401_122321127302221279`. O recebimento real e a resposta privada deste teste foram confirmados; os demais formatos de evento continuam sujeitos aos gates do plano principal.

**Recebimento confirmado em 22/10/2026:** o comentário `122321127302221279_1740025530415851` desse post chegou às **15:26:51 (America/Sao_Paulo)**. O recibo foi conferido no armazenamento do produto, além do print do usuário. Isso comprova esse comentário orgânico; não comprova todos os formatos de publicação, entrega de mensagem privada ou automação completa.

Depois de ativar, os comentários chegam automaticamente por webhook. Não é necessário clicar em **Verificar e ativar recebimento** a cada comentário: esse botão verifica a configuração e a inscrição, não dispara respostas nem busca comentários antigos. O diagnóstico se atualiza enquanto a tela está aberta. Após confirmar a conexão, abra **Automações → Nova automação → Responder comentários**, selecione a Página e os posts, escreva a mensagem, salve e ative. A prova manual anterior continua registrada separadamente; seu comentário já respondido não deve ser usado novamente. Consulte os limites de homologação no manual do criador.

## Como interpretar o painel

| Estado | Próximo passo |
|---|---|
| Autorização necessária | Autorizar novamente e aceitar as permissões; conferir os acessos à Página no aplicativo. |
| Callback pendente | Cadastrar/verificar o callback Page e assinar `feed` na Meta. |
| Callback diferente | Conferir o destino atual e fazer a troca manual consciente no aplicativo. |
| Pronto para testar recebimento | Fazer um comentário novo no post de teste; aguardar o diagnóstico. |
| Página autorizada, diagnóstico ausente ou antigo | Usar **Verificar Página**, ação somente leitura na Meta. O diagnóstico é retido por 30 dias; após cinco minutos sua data é identificada como última verificação registrada, sem simular perda da autorização. |
| Falha na verificação | Conferir autorização/configuração e tentar verificar novamente. O botão de verificação não envia mensagens; o envio único opt-in é uma ação separada na seção de teste. |

Se o token ou o acesso forem revogados/expirarem, usar **Autorizar pelo Facebook Login** para login do Facebook ou atualizar o cadastro de sistema e usar **Reaplicar usuário de sistema** no diagnóstico da Página. Não há promessa de renovação silenciosa permanente do token Facebook. Alterar App ID/Secret invalida a autorização anterior e limpa a apresentação dos valores antigos na tela.

As datas de verificação e recebimento usam o idioma do painel e o fuso horário do navegador. A correção de 22/10 remove o escape HTML duplicado que fazia barras aparecerem como `&#x2F;`, sem desativar o escape global das traduções.

## Resumo e diagnóstico (25/10/2026)

A aba Facebook separa **Aplicativo Meta** (credenciais e URL de retorno) de **Automação da Página** (seleção, estado e próxima ação). **Testar credenciais** testa o aplicativo; **Verificar Página** consulta a configuração da Página sem ativar o recebimento. Os ícones de ajuda do aplicativo e da URL de retorno abrem ao passar o mouse, focar pelo teclado ou tocar; fecham com Escape ou ao clicar fora. Eles explicam informações complementares, sem esconder instruções necessárias. A URL de retorno do login é diferente do callback do webhook.

O recebimento pronto usa um selo verde discreto. Pendências de autorização/configuração ficam em alerta amarelo; falhas de consulta ou operação, em vermelho. Uma falha atual nunca é apresentada como sucesso com base em uma verificação anterior. O impacto de trocar um callback compartilhado fica visível no alerta de conflito, mesmo com o drawer fechado.

Ao clicar em **Verificar Página**, o botão mantém o texto **Verificando Página…**
e um indicador visível também no tema claro. As ações ficam bloqueadas durante a
consulta; somente a ação em andamento mostra carregamento. Ao terminar, a própria
aba apresenta a confirmação do recebimento configurado ou a pendência/falha
encontrada, sem exigir abrir **Ajuda → Diagnóstico**. O status retornado atualiza
o selo e o feedback juntos: HTTP 200 com `CHECK_FAILED` ou configuração pendente
não significa sucesso. Confirmar o recebimento configurado não confirma entrega
de mensagem nem cria uma automação.

O feedback é limpo na próxima ação ou troca de Página/perfil/credencial. Erros de
rede ou resposta inválida exibem o erro na tela e não preservam uma confirmação
anterior. A consulta continua somente leitura na Meta; não envia mensagens,
renova tokens ou ativa inscrições. Detalhes técnicos permanecem no drawer.

Validação do ajuste em 25/10/2026: 105 testes de interface em 15 suítes e
TypeScript aprovados. Um teste com SWR real cobre a revalidação de `lastReadyAt`
sem restaurar o selo verde após falha. No navegador, somente a Página Escorpião
Veneno foi consultada: progresso visível seguido da confirmação na própria aba,
sem erro de console. Captura em `output/facebook-page-check-feedback/resultado.png`.

Na seção **Automação da Página**, a aba Facebook mantém seleção da Página, status compacto e ações de autorizar/verificar/ativar/criar conforme o estado. **Ajuda** abre um drawer lateral com instruções, datas, permissões pendentes, IDs, validade do token, renovação e a prova manual disponível. O aviso de conflito do webhook continua visível no resumo. Abrir o drawer não verifica nem ativa a Página; a prévia da prova continua somente leitura. O atalho para Messenger fecha o drawer antes de trocar a aba. O diagnóstico permite selecionar a Página na própria lateral, mantendo-a aberta com a mesma aba e foco durante a troca. Mudar a seleção na aba principal fecha o drawer; fechar a ajuda ou mudar de perfil/credencial desmonta o diagnóstico. Os dados continuam isolados pelo mesmo contexto e Página. As credenciais do aplicativo e sua edição permanecem na seção **Aplicativo Meta**.

A aba Facebook mostra a Página, o estado e a próxima ação. A aba **Messenger** contém apenas **Webhook do aplicativo**, os campos de callback/token com cópia e tooltips, **Ajuda** e **Gerenciar Páginas**. O token fica oculto; **Copiar** obtém o valor completo. O tutorial fica em drawer lateral, com quatro etapas: abrir o webhook na Meta, copiar os dados, verificar/salvar e assinar `feed` na Meta, e ativar a Página no Facebook. O aviso de impacto sobre todas as Páginas permanece no tooltip do aplicativo e visível no drawer. **Copiar** funciona dentro do guia com os mesmos valores da aba. **Fechar ajuda** fecha o drawer. Também é possível fechar pelo X, Escape ou clique fora; o foco retorna ao botão de abertura. A ativação individual permanece no Facebook. Abrir/fechar o guia ou copiar dados não chama a Meta nem executa POST. A prova manual e **Autorizar pelo Facebook Login** ficam no Facebook, em **Ajuda → Diagnóstico**.

`POST /facebook-automations/:integrationId/check` exige ADMIN, sessão e perfil; não recebe corpo e retorna `FacebookSetupStatus` com `Cache-Control: no-store`. Revalida a Meta sem inscrever Página, mudar callback, renovar token ou enviar mensagem. **Verificar e ativar recebimento** continua sendo a ação explícita de inscrição; o callback OAuth também tenta prepará-la quando o aplicativo já está correto.

O diagnóstico persistido usa um envelope com fingerprint HMAC da credencial e do callback esperado pela instalação. Alteração feita diretamente na Meta é identificada na próxima consulta remota. Troca de app, segredo, token, Página ou callback invalida o registro anterior. `checkedAt` é a última tentativa e `lastReadyAt` é uma confirmação histórica da mesma conexão; uma falha transitória continua como falha, mesmo com confirmação anterior. Esse cache nunca autoriza envios. OAuth mantém seu TTL de 10 minutos. Na primeira abertura após a atualização, diagnósticos antigos podem estar ausentes: use **Verificar Página** para repovoar, sem refazer o OAuth.

## Várias Páginas, perfis e aplicativos

| Configuração | Escopo e repetição |
|---|---|
| App ID/Secret em Credenciais → Facebook | Existe um par efetivo por perfil: próprio, Default compartilhado ou variáveis da instalação. Vários App IDs simultâneos no mesmo perfil não são suportados pelo cadastro atual. |
| Callback e token de verificação | Configurar uma vez por aplicativo Meta nesta instalação. O mesmo App ID usado por diferentes perfis recebe a mesma configuração. Alterar esse callback afeta todas as Páginas já inscritas nesse aplicativo. |
| Páginas conectadas | Um perfil pode ter várias Páginas Facebook. Selecionar cada Página no MultiPost e autorizar/ativar individualmente. A conta humana que faz login precisa ter os acessos necessários à Página escolhida. |
| Autorização e inscrição `feed` da Página | Mantidas por Página/integração no perfil. A operação não percorre nem inscreve todas as Páginas acessíveis ao usuário da Meta. |
| Eventos recebidos | O `entry.id` identifica a Página; o MultiPost resolve a integração e o perfil correspondentes. Páginas desconhecidas, desabilitadas ou sem autorização válida são ignoradas. |

Não confundir vários logins humanos ou várias Páginas com vários aplicativos Meta. O onboarding atual contempla várias Páginas com o aplicativo efetivo do perfil. O suporte a múltiplos App ID/Secret simultâneos no mesmo perfil exigiria outro incremento no modelo de credenciais e no vínculo de cada canal ao aplicativo; não foi implementado nesta correção.

## Referência para manutenção

- Contrato e decisões: [plano do onboarding](../planning/facebook-automation-panel-onboarding.md).
- API autenticada: `/facebook-automations`, somente administrador e perfil explícito; callback público `/public/facebook-automations/:appId`.
- Persistência: registros cifrados em `ProviderCredential`, namespace interno `facebook-automation:<appId>:<pageId>`, protegido contra CRUD genérico. Nenhuma coluna/tabela nova; tokens de publicação e Instagram preservados.
- OAuth: state aleatório de 256 bits, dez minutos, consumido atomicamente com `GETDEL`, vinculado a usuário/org/perfil/integração e fingerprint das credenciais efetivas. Redis 7 já faz parte da instalação local.
- Webhook: corpo bruto até 1 MiB, compressão recusada, HMAC SHA-256 por contexto; consulta apenas o app/Páginas do lote. Integrações desabilitadas/removidas e credenciais alteradas são descartadas. Máximo de 100 entries e 200 autorizações candidatas por chamada nesta etapa.
- Orçamento público: 60 requisições por janela de dez segundos para esta funcionalidade na instalação. Redis dedicado, sem fila offline, timeout de três segundos, falha fechada. Não usa o MockRedis como implementação de produção.
- Diagnóstico: recibo por integração em Redis por sete dias, sem corpo/autor. Não é fila de processamento durável e não substitui o ledger/dispatcher previstos para a automação completa. Não iniciar Temporal nem enviar mensagens a partir dele.
- Regressão: `pnpm test:automations:regression --no-coverage`. O comando força Redis vazio para os testes unitários e usa mocks explícitos para o repositório novo. Testes HTTP usam um servidor Nest local temporário para verificar o parser real.
- Datas/i18n/escape React: `pnpm exec vitest run apps/frontend/src/components/settings/facebook-automation-dates.spec.ts`. A fixture usa um instante ISO obtido de uma data local, tornando as expectativas independentes do fuso da máquina de teste. Validado também com `TZ=UTC` e `TZ=America/Sao_Paulo`.
- Operação local: [Docker recuperado](multipost-local-recovered.md), sempre mantendo o overlay do banco recuperado. Não usar `down -v` ou `prune` para reiniciar.

Fontes de contrato: [Page subscribed_apps](https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/) e [Webhooks do Messenger](https://developers.facebook.com/docs/messenger-platform/webhooks/). A leitura automatizada dessas páginas recebeu HTTP 429 nesta rodada; o aceite continua dependendo da validação real do aplicativo e da Página.


## 6. Prova de resposta privada pelo painel — somente Escorpiano

Esta seção é um teste de homologação opt-in, disponível apenas para o alvo fixo autorizado no servidor. Não é o editor de automações e não dispara respostas quando chegam novos webhooks.

Na mesma tela, após o registro do comentário, abra **Ajuda → Diagnóstico → Teste de resposta privada**. Antes do envio, o painel mostra o texto integral; Página, post e comentário ficam em **Ver detalhes do teste**. Após a tentativa, o resumo do resultado permanece visível e o conteúdo enviado fica nos detalhes. Clicar **Enviar resposta de teste** faz o servidor conferir novamente autorização/token vigente, permissões, callback e inscrição `feed`, somente por leitura. Em seguida consulta o comentário: ID exato, `can_reply_privately=true` e criação há menos de sete dias, sem aceitar data futura. O texto, o destino e os IDs vêm da configuração privada; o navegador envia somente a revisão da prévia.

Mensagem autorizada: “Teste do MultiPost: seu comentário chegou. Aqui está o link: https://www.facebook.com/share/p/1DsHnUeoAy/”. Comentário: `122321127302221279_1740025530415851`; Página `271852286004401`. Não é necessário gerar ou colar access token para esse botão; ele usa a autorização cifrada obtida pelo login anterior.

Antes do POST na Meta, uma reserva exclusiva é gravada e sincronizada em disco. Duas sessões/cliques concorrentes não produzem dois envios. Todos os resultados bloqueiam uma segunda tentativa para esse comentário:

| Estado | Significado e ação |
|---|---|
| `SENT` | A Meta retornou `message_id`. Conferir o Messenger da conta que comentou, inclusive Solicitações de mensagens. Não comprova leitura. |
| `FAILED` | Rejeição explícita da Meta; painel mostra somente código/subcódigo seguro. Não repete automaticamente. |
| `UNKNOWN` | Timeout, resultado ambíguo ou falha ao persistir após POST. Conferir Messenger; não repetir. |
| `SENDING` | Reserva já existe; pode estar em andamento ou ter sido interrompida. Atualizar consulta o resultado, sem reenviar. Persistência do estado exige conferência, não exclusão do arquivo. |

**Atualizar resultado do teste** faz apenas GET. Recarregar a página ou reiniciar o container não apaga a tentativa. Recibo expirado/substituído também não apaga o resultado. Antes da primeira tentativa, se outro comentário substituir o último recibo, o teste fica bloqueado: ele nunca escolhe outro autor automaticamente.

### Operação local e continuidade

- `FACEBOOK_AUTOMATION_PROOF_CONFIG=/run/facebook-panel-proof/config.json`: arquivo opt-in somente leitura, sem access tokens. Ausência da variável desativa a seção; configuração inválida falha fechado.
- Fonte no host: `.secrets/meta-webhook-escorpiano/panel-proof.json`, permissão 600. Campos: `organizationId`, `profileId`, `integrationId`, `appId`, `pageId`, `postId`, `commentId`, `text`, `ledgerId`. Esses campos fixam a prova autorizada, não são um cadastro genérico de automações.
- `FACEBOOK_AUTOMATION_PROOF_DIR=/run/facebook-panel-proof-ledger`: bind persistente de `.secrets/meta-automation-proof-ledger`, fora de uploads e compartilhado com o CLI antigo. Não apagar/mover a pasta, o marcador `.ledger-id` ou as reservas. `ledgerId` deve coincidir com o marcador previamente inicializado. O produto não inicializa diretório/marcador; mount ausente não é substituído por armazenamento efêmero.
- O quarto overlay `docker-compose.meta-proof.yaml` agora contém esses mounts do `app`, além do receptor antigo. Usa `create_host_path: false`. O mesmo comando de subir com quatro arquivos permanece válido. Sem migração SQL, `prisma db push`, limpeza de volumes, troca de banco ou alteração de cron.
- Endpoint ADMIN: `GET/POST /facebook-automations/:integrationId/private-reply-test`. POST aceita `{ "revision": "<sha256 da prévia>" }`. Não configurar jobs/retries para esse endpoint.
- Persistência de homologação em uma instância. O futuro motor de produção precisa do ledger de execução no banco definido no plano principal, não deve escalar esta prova em vários hosts.
- Para desligar a prova, remover as duas variáveis/mounts do `app` e recriar somente o serviço. Conservar o ledger para auditoria e deduplicação. Uma nova prova/destino exige nova definição autorizada; nunca liberar reenvio apagando reserva.

### Testes e entrega local

Comandos: `pnpm test:automations:regression`, `pnpm exec vitest run --config tools/vitest.facebook-panel.config.mts`, `pnpm exec tsc -p apps/frontend/tsconfig.json --noEmit --incremental false`, `pnpm build:backend`.

Em 22/10: regressão de 459 testes em 28 suítes passou; quatro casos adicionais de vínculo/persistência foram acrescentados depois e a suíte focal passou com 43 testes. UI/datas: 8 testes passaram; TypeScript frontend e build backend passaram. Cobertura inclui GET sem mutação, ADMIN, outro contexto/Página/app, prévia antiga/token rotacionado, recibo divergente, janela/eligibilidade, concorrência, falta de armazenamento, reserva parcial, timeout, sucesso remoto com falha ao salvar e restart.

Imagem incremental local `multipost-facebook-local:panel-proof-20261022`, baseada na imagem anterior e no build backend validado, com fontes/UI/traduções alteradas. A receita integral continua em `var/docker/local.Dockerfile`. Rollback preservado em `multipost-facebook-local:pre-panel-proof-20261022`; atualizar/reverter recria apenas `app`, preservando banco, Redis, Temporal e ledger. O `NEXT_DEPLOYMENT_ID` continua versionando os assets a cada boot local.

**Resultado real em 22/10/2026 às 16:15:43 (America/Sao_Paulo): `SENT`.** O botão foi executado uma única vez no perfil Escorpiano, após conferência da prévia exata. A Meta retornou `message_id=m__Smcnkb0yok-kmYepcdh27Ka28NHYiNrbgPWBJDRpYvCZhWeEpxnFLBy4y2j0bBNXVw47n53-6CndC2naHnrdQ`. A resposta foi aceita pela API. Em 22/10/2026, o usuário confirmou no chat: “Sim, recebi a mensagem com o link”. Isso confirma o recebimento visível pelo destinatário neste teste; o estado `SENT` da API, isoladamente, continua sem comprovar leitura.

Validação de runtime: container saudável na imagem `sha256:3368425df0631292cd98f40bdb3da2a8e3df954a73293a55b8ebd4fd1b36e848`; config corresponde aos IDs autorizados; marcador do bind confere; fsync do diretório funciona. No host, arquivo privado modo 600 contém exatamente reserva `SENDING` e resultado `SENT`. Após reload completo e **Atualizar resultado do teste**, o painel mantém `SENT` e o botão de envio continua desabilitado. Console sem erros/avisos capturados. Screenshot: `tmp/facebook-private-reply-sent-20261022.jpg`.

O restart real pós-envio não foi necessário; continuidade entre instâncias está coberta por teste automatizado e o bind foi conferido no host/container. O startup ainda registra a falha preexistente `Temporal Service is not initialized` no reconciliador de refresh cron, já descrita no runbook local; não foi alterada neste incremento. Nenhuma mutação Meta em outra Página/Instagram foi realizada. Não houve publicação de post nem resposta pública.

Plan-reviewer, code-reviewer, security-auditor e doc-maintainer concluídos. Código/segurança sem blockers; caso adicional de sucesso remoto seguido de falha ao gravar foi incorporado. Sugestões de mapas/pitfalls em CLAUDE.md permanecem propostas, sem edição desses arquivos. Sem commit/PR/deploy de produção nesta entrega.

## Separação Messenger — validação de 24/10/2026

- Interface: **52 testes passaram** na configuração `tools/vitest.facebook-panel.config.mts`. Cobertura nova de quatro abas, atalhos/teclado/link direto, manutenção de rascunhos, ausência de POST ao navegar/copiar, token oculto, precondição 412, acesso ADMIN, cache por perfil/credencial e revalidação ao reabrir a aba.
- Backend/Instagram: **502 testes passaram**, 5 ignorados pela configuração existente (34 suítes executadas). O contrato novo testa callback/token idênticos entre Páginas do mesmo aplicativo e rejeição de divergências em organização, perfil, integração, Página, aplicativo e segredo.
- `pnpm build:backend`, TypeScript do frontend e `git diff --check` passaram. Revisões de plano, código, segurança e documentação concluídas; corrigidas também as mensagens antigas que encaminhavam para Configuração avançada.
- Navegador autenticado no **Escorpiano**: Messenger abriu pelo link direto; o atalho retornou à Página **Escorpião Veneno** já selecionada; o atalho inverso abriu novamente Messenger. Console sem erros capturados. Não foram acionados autorização, ativação ou envio real nessa validação de interface.
- Prints reais: [Messenger](../../output/messenger-tab-20261024/messenger.jpg) e [Facebook](../../output/messenger-tab-20261024/facebook.jpg). Token oculto pelo próprio campo da interface.
- Ambiente local atualizado com `multipost-facebook-local:messenger-tab-20261024`, também marcado `source`, manifest `sha256:5f693d400a885fd5b61c55f8e1f8e656cdf8ed93c7787f3a59bdc534f31bb752`. Base preservada: `multipost-facebook-local:style-guide-20261024`.
- Receita incremental local em `tmp/messenger-tab-runtime/Dockerfile`: fontes afetadas, ícone e traduções; controller, serviço e DTO compilados pelo build backend validado. Dependências e worker não foram reconstruídos. A imagem integral de instalação continua usando `var/docker/local.Dockerfile`.
- Recriado somente `app`, com os quatro overlays `local`, `tunnel`, `restored` e `meta-proof`; container saudável. Banco recuperado, volumes e ledger preservados. Para reverter a interface/API deste incremento, marcar a imagem base como `source` e recriar somente `app` com os mesmos quatro overlays. Sem commit, PR ou publicação em produção.

## Guia lateral do Messenger — validação de 24–25/10/2026

- A aba mantém somente URL de callback, token oculto, cópia, tooltips e **Gerenciar Páginas**. **Como configurar** abre o passo a passo no drawer lateral; **Voltar aos dados** fecha o guia para copiar os campos da aba. Não há campos duplicados no guia.
- `pnpm exec vitest run --config tools/vitest.facebook-panel.config.mts`: **62 testes passaram em 12 arquivos**, incluindo 17 do Messenger. Cobertura de abertura/fechamento, Escape, clique externo, arraste entre guia e fundo, StrictMode, limites Tab/Shift+Tab, tooltips, cache por contexto e ausência de POST. TypeScript do frontend e `git diff --check` passaram.
- Navegador autenticado somente no **Escorpiano**: Tab e Shift+Tab permanecem no guia; Escape, X, botão de retorno e clique fora fecham o drawer e restauram o foco. Desktop em 1280×720; drawer em 375×667 ocupa toda a largura, com rolagem interna e sem transbordamento horizontal. A alteração não adapta o restante da tela de Configurações ao celular.
- Houve falha transitória de conexão/fetch durante o reinício local; após recuperar a aba e usar **Tentar novamente**, os campos carregaram. Nenhum botão de autorização, ativação ou envio real foi acionado. Backend e lógica das automações/Instagram não foram alterados neste incremento; a regressão backend registrada na seção anterior não foi reexecutada nesta rodada de UI.
- Prints reais: [aba Messenger](../../output/messenger-drawer-20261024/aba-messenger.jpg), [guia lateral](../../output/messenger-drawer-20261024/guia-lateral.jpg) e [rolagem no celular](../../output/messenger-drawer-20261024/guia-mobile.jpg). Token mascarado pela própria interface.
- Imagem local `multipost-facebook-local:messenger-drawer-20261024`, também marcada `source`, manifest `sha256:a93d3be1cff079430b8cd97a9e9bb83605a2191688c0e9160b2840095837e207`. Receita incremental em `tmp/messenger-drawer-runtime/Dockerfile`; somente componentes e traduções do frontend. Rollback: `multipost-facebook-local:messenger-tab-20261024`.
- Recriado somente `app` com os mesmos quatro overlays; container saudável. Banco, volumes, ledger e workers preservados. Revisões de plano, código e documentação concluídas. Sem commit, PR ou publicação em produção.

## Drawer do Facebook — alteração de 25/10/2026

Reorganização somente de interface, sem alteração de endpoints, autorização, polling, inscrição, envio ou contratos dos tokens. O casco acessível do drawer é compartilhado entre Facebook e Messenger em `settings-drawer.component.tsx`; conteúdo e ações continuam separados por produto. `FacebookPrivateReplyTest` só é montado com drawer aberto e Página autorizada, com a mesma chave de perfil/credencial/integração e as mesmas travas de envio. Mensagens completas de status ficam no drawer; status pendentes/falhos e erro atual permanecem identificáveis no resumo.

- **72 testes passaram em 12 arquivos** com `pnpm exec vitest run --config tools/vitest.facebook-panel.config.mts`, incluindo 16 casos do Facebook e 17 do Messenger. Casos novos cobrem resumo/drawer, fechamento, troca de Página/perfil/credencial, leitura sem POST, preservação das ações, permissão/validade somente no diagnóstico, erro atual sem sucesso antigo e fechamento antes do atalho Messenger. TypeScript do frontend e `git diff --check` passaram.
- Navegador no **Escorpiano**: drawer abre/fecha, Escape e botão de retorno restauram foco, clique fora fecha, Tab/Shift+Tab permanecem no diálogo e ignoram envio desabilitado; atalho fecha o diálogo antes de focar a aba Messenger. Guia Messenger também conferido após extrair o componente comum. Console sem erros capturados nesta rodada.
- Desktop 1280×720 e drawer 375×667: conteúdo rolável, cabeçalho/rodapé fixos, largura do drawer igual à tela no celular e sem transbordamento horizontal interno. O restante de Configurações continua com seu layout existente.
- Somente navegação e leitura no ambiente real. Não foram executados check/activate/authorize, renovação ou envio. A prova manual manteve o resultado anterior e botão de envio desabilitado. Não houve teste real em outras Páginas/Instagram.
- Prints: [Facebook](../../output/facebook-drawer-20261025/facebook.jpg), [drawer](../../output/facebook-drawer-20261025/drawer.jpg), [diagnóstico após rolar](../../output/facebook-drawer-20261025/diagnostico.jpg) e [celular](../../output/facebook-drawer-20261025/mobile.jpg).
- Imagem incremental local `multipost-facebook-local:facebook-drawer-20261025` também marcada `source`, manifest `sha256:be4669d1474b0012ad441d34a6f1d13aa78cdcae00a0a2f2023f98f9f06604b6`. Receita em `tmp/facebook-drawer-runtime/Dockerfile`, somente fontes de UI e traduções. Rollback preservado em `multipost-facebook-local:messenger-drawer-20261024`.
- Recriado somente `app` com os overlays `local`, `tunnel`, `restored`, `meta-proof`; banco recuperado, volumes, workers e ledger preservados. Sem mudança/build/teste adicional de backend nesta rodada. Revisões de plano, código e documentação concluídas, sem edição de CLAUDE/AGENTS; sem commit, PR ou publicação em produção.

### Padronização da ajuda e aba Usuário de sistema — 25/10/2026

- **86 testes de interface passaram em 14 arquivos** (`tools/vitest.facebook-panel.config.mts`), incluindo guia/diagnóstico, teclado, disponibilidade dos tokens sem App ID Instagram local, payloads parciais e descarte de validação pendente na troca de perfil. Após o ajuste de largura das abas, os 11 testes do card Meta foram repetidos e passaram.
- **84 testes passaram em 7 suítes de backend**: contratos de credenciais/escopo, autorização Facebook, roteamento de comentários, Instagram Messaging e Meta System User. Os testes novos reproduziram o problema antes da correção e passaram depois. Divergência de perfil/organização bloqueia leitura, validação e gravação; perfil vazio é comparado explicitamente.
- TypeScript do frontend, build do backend e `git diff --check` passaram. Revisões de código e segurança não apontaram pendências impeditivas no incremento. Não houve migração nem alteração de dados/tokens reais.
- Runtime local: imagem `multipost-facebook-local:meta-help-20261025` (manifesto `sha256:57d5280c4612cf2946bcc0345ed908c8331aec70c4262a7b3fa8818b9d642b30`), também marcada `:source`. Somente o serviço `app` foi recriado; volumes e demais serviços preservados. Rollback disponível na imagem `multipost-facebook-local:facebook-drawer-20261025`.
- Em áreas estreitas, as abas mantêm larguras iguais e permitem rolagem horizontal para não sobrepor nomes. O drawer usa a largura inteira em 390 px. A estrutura geral de navegação de Configurações ainda possui uma limitação anterior de largura em celular; este incremento não altera o layout global.
- Conferência no navegador autenticado somente no perfil Escorpiano: cinco abas, um botão Ajuda por aba, guias e diagnósticos de Facebook/Instagram/Threads/Messenger/Usuário de sistema, fechamento por Escape/rodapé e retorno de foco. Instagram manteve `@escorpiano_veneno`; Facebook manteve Escorpião Veneno e o status registrado. Não foram acionados salvar, remover, renovar, verificar ou enviar. Console sem avisos/erros capturados. Capturas em `output/meta-help-20261025/`: `system-user-desktop.png`, `instagram-diagnostics-desktop.png`, `system-user-narrow.png` e `help-mobile.png`.


## Ajuda e feedback das ações — 25/10/2026

O padrão completo está em [Ajuda e retorno das ações Meta](../design/meta-help-feedback.md). O Facebook separa os métodos de autorização no guia; Instagram recolhe a alternativa avançada; Messenger permite copiar os dados no guia; Threads e Usuário de sistema mantêm instruções curtas. A escolha do método no guia não executa autorização.

As ações mantêm texto durante carregamento e resultado na seção onde foram acionadas. Testar credenciais confirma somente o aplicativo. Verificar/ativar Página usa o estado retornado pela API, inclusive pendências com HTTP 200. Salvar/remover e copiar apresentam falhas locais, sem respostas brutas. Os payloads e a operação das automações permanecem iguais.

Validação automatizada: **119 testes em 18 arquivos**, incluindo regressão da interface compartilhada Facebook/Instagram; TypeScript do frontend aprovado. As ações de escrita foram verificadas com respostas simuladas. A revisão de código e a auditoria de segurança não apontaram pendências no incremento. Sem alteração de banco, backend ou permissões.

Validação no navegador autenticado, somente Escorpiano: as cinco ajudas abriram com conteúdo correspondente; Facebook alternou instruções sem autorizar; Instagram manteve a alternativa avançada recolhida; atalhos liberaram o foco antes da navegação. Testar credenciais mostrou “Testando credenciais…” e confirmação local, distinguindo aplicativo de Página. No Messenger, Copiar confirmou dentro do guia e manteve-o aberto. Verificar Página também manteve progresso visível e confirmou o recebimento no resumo e uma única vez no diagnóstico. Console sem erros. Nenhuma credencial alterada, autorização renovada ou mensagem enviada nessa validação.

Imagem local final: `multipost-facebook-local:meta-guided-help-final-20261025`, também marcada `source`. Recriado somente `app`, saudável e sem reinícios; workers main/Facebook/Instagram saudáveis. Rollback da interface: remarcar `multipost-facebook-local:page-check-feedback-20261025` como `source` e recriar somente `app` com os mesmos overlays local/tunnel/restored/meta-proof. Capturas em `output/meta-guided-help-20261025/`. Sem commit, PR ou deploy de produção.

### Seletor na ajuda do Instagram — 25/10/2026

O Instagram passa a usar o mesmo padrão visual do Facebook: **Token da conta** (seleção inicial) e **Usuário de sistema**. Isso substitui a alternativa anteriormente recolhida. A escolha troca somente as instruções, sem salvar ou aplicar um token. O caminho de sistema deixa visível a compatibilidade com respostas a stories e consulta de seguidores; para comentários do feed, mantém explícito o requisito do token individual, conta conectada e webhook Instagram. O atalho fecha o drawer antes de abrir a aba Usuário de sistema, preservando os rascunhos.

Validação automatizada: o teste do atalho e o novo teste de alternância falharam antes da implementação por ausência do seletor e passaram depois. **120 testes em 18 arquivos**, TypeScript do frontend e `git diff --check` passaram. Revisão de código sem bloqueadores. Não houve mudança de backend, contratos, tokens ou automações.

Validação no navegador autenticado somente no Escorpiano: seleção inicial Token da conta, troca por clique e teclado para Usuário de sistema, aviso de compatibilidade visível e atalho para a aba própria com foco correto. Conta Instagram e token cadastrado preservados; nenhuma gravação, autorização ou envio acionado. Console sem erros. Capturas em `output/instagram-help-methods-20261025/`.

Imagem local `multipost-facebook-local:instagram-help-methods-20261025`, também marcada `source`. Somente `app` recriado, saudável e sem reinícios; workers main/Facebook/Instagram saudáveis. Rollback: remarcar `multipost-facebook-local:meta-guided-help-final-20261025` como `source` e recriar somente `app` com os overlays existentes. Documentação revisada; sem alterações de CLAUDE/AGENTS, commit, PR ou publicação em produção.

### Diagnósticos compactos — 26/10/2026

As cinco abas seguem o [padrão de diagnóstico](../design/meta-help-feedback.md#diagnóstico-estado-evidência-e-detalhes): resumo, evidência registrada, ações existentes e detalhes recolhidos. Facebook distingue o token da Página do token de origem de sistema; não há seleção do vencimento mais recente entre eles. A prova privada mantém escopo, revisão e bloqueio contra duplicação, com resultado visível e detalhes recolhidos. Messenger oferece um atalho de navegação para consultar a Página, sem executar a verificação. Instagram exibe `refreshedAt` como cadastro ou renovação, sem alterar a rotina de tokens.

**126 testes de interface passaram em 18 arquivos**, incluindo validades divergentes, falta de dados da Página, falha de consulta, navegação sem mutações e ausência de reenvio após tentativa registrada. Os seis novos casos falharam antes da implementação; os rótulos antigos dos testes foram atualizados para a nova apresentação. Uma execução sofreu timeout durante a interrupção noturna do ambiente; a repetição integral passou em 12,83 segundos. TypeScript do frontend e `git diff --check` passaram. Revisão de código sem bloqueadores. Sem mudanças de backend, schema ou permissões.

Conferência no navegador autenticado somente no Escorpiano: os cinco diagnósticos abriram com o conteúdo correspondente; os identificadores e detalhes de teste ficaram recolhidos; a data do Instagram indicou cadastro ou renovação. O atalho do Messenger fechou o drawer e abriu o Facebook com a Página preservada, sem executar verificação. A prova privada manteve o resultado registrado e não apresentou nova ação de envio. Nenhuma autorização, credencial ou mensagem foi alterada durante essa conferência. Console sem erros capturados. Prints: [Facebook](../../output/meta-diagnostics-20261026/facebook.png), [Instagram](../../output/meta-diagnostics-20261026/instagram.png), [Messenger](../../output/meta-diagnostics-20261026/messenger.png) e [Usuário de sistema](../../output/meta-diagnostics-20261026/system-user.png).

Após o ajuste final de espaçamento e textos, os **41 testes de configuração Facebook e prova privada** foram repetidos e passaram. Revisões de código e documentação concluídas. Imagem local final `multipost-facebook-local:meta-diagnostics-final-20261026`, também marcada `source`, manifesto `sha256:3ec99096e45fb2a704196e42e5c7a847f6646175725509a6ffb6d362dd969947`. Somente `app` foi recriado: saudável, sem reinícios, com workers main/Facebook/Instagram saudáveis; banco, volumes e ledger preservados. Rollback: remarcar `multipost-facebook-local:instagram-help-methods-20261025` como `source` e recriar somente `app` com os overlays local/tunnel/restored/meta-proof. Sem commit, PR ou publicação em produção.

### Seleção de Página dentro do diagnóstico — 26/10/2026

**Ajuda → Diagnóstico** do Facebook oferece o mesmo seletor de Páginas conectadas da aba principal. Pode ser aberto sem seleção anterior. Escolher, trocar ou limpar a Página mantém a lateral aberta e sincroniza o resumo; carregamento, ausência de Páginas e falhas de consulta têm retorno dentro da lateral, com **Tentar novamente** quando necessário. A seleção apenas lê os dados registrados, sem autorizar, verificar na Meta, ativar recebimento ou enviar mensagem. A prova continua isolada pela chave de contexto/Página e os seletores ficam bloqueados durante as ações existentes.

Validação automatizada: três cenários novos falharam antes da implementação e passaram depois; um quarto cobre falha tardia de retry. **130 testes em 18 arquivos**, TypeScript do frontend e revisão de código aprovados. Cobertura com SWR real inclui troca A→B antes da resposta de A, preservação da aba/foco, sincronização dos seletores, seleção vazia, erro e nova tentativa, perfil sem Páginas e ausência de POST na navegação. A checagem existente de operação em andamento também verifica o bloqueio dos seletores. O retry usa erros da chave atual do SWR, sem criar erro global para uma seleção posterior. Contratos de backend e tokens permanecem iguais.

Conferência real somente no Escorpiano: seleção externa vazia, abertura de Ajuda → Diagnóstico, escolha de Escorpião Veneno dentro da lateral e confirmação de que a aba principal reflete a mesma escolha. A lateral permaneceu aberta na seção Diagnóstico; console sem erros capturados. Nenhuma verificação Meta, renovação, ativação ou mensagem foi acionada. O polimento que removeu a instrução duplicada foi validado com **41 testes focais** e novo print: [seletor no diagnóstico](../../output/facebook-diagnostic-selector-20261026/facebook.png).

Imagem local `multipost-facebook-local:diagnostic-selector-20261026`, também marcada `source`, manifesto `sha256:de4e3f969a83f8b0bbb9fc5889aed501cc6cc8e48690e6d133af3cc35bbbbb00`. Somente `app` recriado, saudável e sem reinícios; workers main/Facebook/Instagram saudáveis. Receita incremental em `tmp/facebook-diagnostic-selector-runtime/Dockerfile`, alterando somente o componente de configuração Facebook. Rollback preservado em `multipost-facebook-local:meta-diagnostics-final-20261026`, com os mesmos overlays e volumes. Revisões de código e documentação concluídas; sem commit, PR ou publicação em produção.
