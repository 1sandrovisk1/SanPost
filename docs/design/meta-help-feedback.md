# Ajuda e retorno das ações Meta

## Objetivo

Deixar explícito quando uma ação está em andamento e qual foi o resultado, mantendo os contratos de autorização, credenciais, tokens e automações existentes.

## Padrão de interface

- Operações assíncronas mantêm texto de progresso visível, indicador na cor do botão e bloqueio de repetição. O componente Button oferece `loadingLabel` opcional; os demais consumidores mantêm a apresentação anterior.
- Testar credenciais retorna confirmação ou falha junto à ação. O resultado não comprova autorização da Página ou recebimento de comentários.
- Verificar/ativar Página respeita o estado retornado pelo backend: HTTP 200 não significa recebimento pronto. Dados técnicos continuam em Ajuda → Diagnóstico.
- Salvar/remover tokens e credenciais informa resultado na seção correspondente. Não exibir corpos de erro brutos ou segredos nas mensagens.
- Copiar confirma somente após sucesso do clipboard. Falhas orientam selecionar e copiar o campo manualmente. Token de verificação do Messenger permanece oculto, inclusive na ajuda.

## Ajuda contextual

- Um drawer por rede, com as seções Como configurar e Diagnóstico. Diagnóstico contém dados reais e permanece com esse nome.
- Facebook: a escolha Facebook Login / Usuário de sistema muda apenas as instruções. A Página precisa estar conectada; o usuário de sistema não importa ativos automaticamente. Permissões técnicas ficam em detalhe expansível. O webhook do aplicativo é necessário em ambos os caminhos.
- Instagram: o mesmo seletor visual do Facebook separa **Token da conta** (padrão) e **Usuário de sistema**. A escolha muda somente as instruções, sem cadastrar tokens ou trocar a autorização em uso. A alternativa de sistema mostra a compatibilidade com respostas a stories e consulta de seguidores; o aviso sobre manter a conta, o token individual dos comentários do feed e o webhook fica visível antes do atalho de configuração. O atalho fecha o drawer e abre a aba própria sem perder rascunhos.
- Messenger: URL e token são os mesmos dados lidos para a aba, sem nova credencial ou nova chamada. A ajuda permite copiá-los sem fechar. Na falta de autorização, orienta autorizar a Página primeiro.
- Usuário de sistema: pré-requisito curto, passos de atribuição/geração/validação e aplicação explícita à Página. Não prometer acesso universal nem token irrevogável.
- Threads: guia curto e limite explícito de que não ativa automações de comentários.
- Sem indicadores de conclusão baseados apenas em navegação. Atalhos liberam o foco do drawer antes de abrir a aba de destino.

## Validação

Testes de interface usam respostas simuladas para ações de salvar/remover/autorizar/enviar, preservando as contas reais. No navegador autenticado, validação restrita ao perfil Escorpiano, navegação e consultas de verificação. Não enviar mensagens nem alterar credenciais para validar feedback visual.

## Diagnóstico: estado, evidência e detalhes

As cinco abas usam uma observação discreta sobre informações registradas: abrir o diagnóstico não executa nova verificação na Meta. O resumo identifica a Página, conta ou aplicativo, seguido das datas conhecidas. Cadastro não equivale a validação atual; ausência de evidência não deve receber indicação de sucesso. O rodapé **Fechar ajuda** permanece disponível.

- **Facebook:** resumo da Página e última verificação; autorização e manutenção; último comentário recebido; detalhes técnicos recolhidos com IDs copiáveis. Erros da ação atual têm prioridade sobre um sucesso registrado. A última confirmação anterior, quando há falha, permanece identificada como histórica.
- **Seleção no diagnóstico Facebook:** o próprio drawer oferece o seletor das Páginas conectadas ao perfil, sincronizado com a aba principal. Trocar ou limpar a seleção mantém o diagnóstico aberto e o foco no seletor; os dados anteriores não aparecem enquanto a nova Página carrega. Falhas oferecem **Tentar novamente** dentro da lateral. Selecionar uma Página apenas consulta seus dados registrados, sem autorizar, verificar na Meta, ativar ou enviar mensagens. Durante uma ação de autorização/verificação, os dois seletores ficam bloqueados. Perfil sem Páginas recebe orientação para conectar uma Página.
- **Validade no Facebook:** `status.*` descreve o token da Página; `authorization.*` descreve o token de origem do usuário de sistema. São tokens diferentes: não escolher o mais recente nem combinar suas validades. A validade da Página fica no resumo de autorização; a da origem, com sua data, nos detalhes técnicos. Prazo do token e acesso aos dados são campos distintos. Somente `noScheduledExpiry === true` significa ausência de vencimento programado; `null`/campo ausente significa informação indisponível. Um aviso comum explica revogação/permissões.
- **Manutenção:** **Autorizar pelo Facebook Login** inicia o OAuth existente; **Reaplicar usuário de sistema** aplica o token já cadastrado à Página, sem gerar ou editar o token. Os contratos e as regras de preservação de automações continuam iguais.
- **Teste privado:** prova controlada pela configuração de homologação existente. Sem número de etapa ou contêineres aninhados; o resultado aparece resumido, com IDs/códigos e conteúdo em detalhes. Aceite da Meta não comprova entrega nem leitura. Uma tentativa registrada não oferece reenvio; preview, revisão, bloqueios e atualização de resultado mantêm os contratos anteriores.
- **Instagram:** conta e estado de cadastro, validação registrada e **Token cadastrado ou renovado em**. O rótulo representa `refreshedAt`, inicializado no cadastro e atualizado na renovação. Não é prova de uma renovação separada. O relógio usado por `ensureFreshIgToken`, os tokens e a API não foram modificados. ID da conta fica em detalhes.
- **Usuário de sistema:** cadastro e validação separados dos ativos identificados. A validade não é inferida nesta tela. Ativos ficam recolhidos, com aviso de que identificá-los não os conecta nem ativa automações. O passo a passo de aplicação permanece em Como configurar.
- **Messenger:** dados disponíveis para copiar são distintos da configuração remota, que não é comprovada por essa tela. O atalho **Ver recebimento no Facebook** somente navega; a consulta continua por Página. App ID fica recolhido; nenhum segredo é acrescentado ao diagnóstico.
- **Threads:** somente cadastro do aplicativo e orientação para conferir os canais; sem inventar validações ou eventos.
