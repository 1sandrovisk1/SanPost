# Editor rápido de automações

Atualizado em 28/10/2026. O editor mantém o formulário à esquerda e a prévia à direita, sem os títulos e subtítulos redundantes de edição. Instagram, Facebook e Messenger compartilham a apresentação; cada gatilho continua usando seu motor, suas capacidades e seus contratos.

## Ambiente da automação

O nome editável, a conta/gatilho, o status confirmado e **Salvar** ficam numa única barra acima das abas **Editor rápido**, **Construtor visual** e **Histórico**. O nome só é gravado ao salvar. As rotas antigas do Instagram abrem esse ambiente sem exigir a tela intermediária de resumo; repost continua separado.

A URL mantém o modo em `?view=quick|flow|history`; links V2 antigos com `?tab=history` continuam válidos. Abrir Histórico conserva o editor e suas alterações montados. Ele mostra apenas as execuções da automação atual, com [tabela, filtros e drawer de detalhes padronizados](historico-execucoes-automacoes.md). O inspetor de nós fica à esquerda do canvas, em coluna própria, nos dois construtores. A caixa de comentários não vinculados e os logs gerais não foram convertidos em execuções.

No Facebook/Messenger, rápido e visual compartilham a definição em memória, inclusive durante a consulta ao Histórico. No Instagram V1, trocar entre os dois editores exige salvar primeiro; a consulta ao Histórico é livre e mantém o rascunho. A troca limpa revalida a mesma automação antes de montar o outro editor. Alterações ainda não aplicadas no painel de um nó também bloqueiam a troca. Grafos com nós, ramificações ou configurações que o rápido não representa permanecem no construtor visual, inclusive por acesso direto à URL. Uma atualização remota não substitui o tipo nem apaga o rascunho local.

Automações Instagram novas mostram Construtor e Histórico indisponíveis até salvar o registro. Clicar nas abas nunca cria rascunho nem envia alterações. No Facebook, o canvas já funciona em memória antes do primeiro salvamento; o Histórico exige um registro salvo.

## Organização

1. **Gatilho e conta:** identifica o evento e a conta/Página.
2. **Onde será executada:** publicações e agendados, quando aplicável. Messenger não usa uma publicação como origem.
3. **Condições:** palavras-chave ou **Qualquer comentário**. Messenger continua exigindo palavras-chave.
4. **Resposta:** resposta pública opcional e suas variações, seguidas da mensagem privada e do botão com link. Responder publicamente é uma ação, não uma condição.
5. **Recursos adicionais:** seguidores no Instagram e configurações compatíveis com o gatilho.

Instagram mantém a conta vinculada após preparar/criar o registro, com o seletor bloqueado e sem a frase explicativa anterior. Facebook permite alterar a Página conforme o contrato existente; a troca limpa as publicações incompatíveis e não desconecta a conta do MultiPost. Regras V2 antigas com outras redes preservam seus canais e grafo. Publicações já publicadas deixam de mostrar o aviso do vínculo agendado; o vínculo e os avisos de falha/cancelamento/indisponibilidade são preservados.

## Entrega direta e etapas do Instagram

Na entrega direta, a prévia mostra apenas a mensagem e o link configurados. Um botão que abre um site é identificado como **botão de link**, sem representar um clique que continue a conversa.

Comentários do Instagram com **Pedir para seguir antes de enviar** têm três grupos recolhíveis:

- **Mensagem inicial:** texto e botão de resposta que inicia a verificação.
- **Verificação de seguidores:** mensagem para quem ainda não segue e botão de nova verificação.
- **Tentativas e encerramento:** limite e mensagem ao esgotar tentativas.

Os grupos mostram resumos e preservam todos os campos. Os textos vêm preenchidos; se o usuário apagar uma mensagem necessária ou um botão, deve preenchê-los antes de salvar/ativar. Isso evita uma prévia vazia que não corresponda ao envio. Em **Resposta**, a mensagem privada é a entrega final desse fluxo.

Stories do Instagram verificam seguidores diretamente: a prévia oferece somente **Ainda não segue** e **Entrega para quem segue**. Não há abertura com botão nesse gatilho. Facebook/Messenger não oferecem o gate nem uma abertura genérica independente. Essa abertura exige uma evolução própria de execução, API/MCP e validação; esta revisão visual não a implementa.

## Construtor visual e ajuda contextual

No Instagram, **Aplicar ao nó** atualiza apenas o rascunho; **Salvar** no cabeçalho grava nome e grafo. Edições não aplicadas continuam protegidas antes de fechar/trocar o nó ou editor. Facebook/Messenger atualizam diretamente o rascunho do grafo e usam o mesmo Salvar global. Selecionar um nó não grava nem ativa a automação. O drop usa as coordenadas reais do canvas, incluindo pan/zoom e a coluna esquerda.

O cabeçalho não repete o estado do toggle em uma frase. Erros, alterações pendentes e impacto no salvamento continuam visíveis. O status positivo do Instagram informa **Webhook configurado**, sem prometer validação completa do token. Explicações secundárias de entrega, links, palavras-chave, gate e prévia ficam em ajuda contextual aberta por clique, toque ou teclado.

**Inserir variável** no editor rápido de comentários e nos campos de resposta pública/privada do inspetor V1 do Instagram insere no cursor um dos tokens V1 suportados (`{commenter_name}`, `{commenter_id}`, `{comment_text}`, `{media_id}`). A inserção preserva o restante do texto e não salva. Facebook/Messenger oferecem o mesmo menu nos campos privados com tokens V2: `{{comment_name}}`, `{{comment_text}}`, `{{comment_id}}`, `{{media_id}}`. No Messenger, somente texto e ID da mensagem estão disponíveis.

## Prévia contextual

Focar uma variação pública mostra **Comentários** com aquele texto. Focar a mensagem privada ou editar o botão com link mostra **DM**. Campos do gate selecionam a etapa correspondente. A navegação manual pelas abas continua disponível; a alternativa ilustrada acompanha o foco do campo, sem seletor adicional na prévia.

O **Caminho ilustrado** permite ver abertura, pessoa que ainda não segue, encerramento ou entrega, conforme o gatilho. Messenger representa a palavra-chave recebida antes da resposta da Página, sem atribuir a mensagem a um Story. As variáveis usam valores ilustrativos; nada é enviado ao navegar ou clicar na prévia.

A publicação ilustrada acompanha a seleção do catálogo, inclusive páginas adicionais, ou o agendamento selecionado (mesmo fora da primeira página). Quando há várias, **Publicação na prévia** alterna apenas a ilustração. Não muda escopo, vínculo nem estado de edição. Vídeo sem thumbnail é exibido como vídeo sem autoplay. Se a mídia selecionada estiver ausente ou falhar, a prévia informa indisponibilidade, sem pedir uma nova seleção. O telefone usa escala maior, mantendo scroll próprio quando necessário.

## Salvar, ativar e pausar

| Estado | Ações |
| --- | --- |
| Rascunho | Salvar na barra superior; ligar o toggle para ativar |
| Pausada | Salvar na barra superior; ligar o toggle para reativar |
| Ativa, sem alterações | Desligar o toggle para pausar; Salvar permanece desabilitado |
| Ativa, com alterações | Salvar na barra superior; desligar o toggle pausa preservando a edição local |
| Arquivada | Consulta sem ações de edição |

O toggle fica na barra comum em todos os modos. Nos modos de edição, nos editores rápidos e no V2, ligar com alterações salva primeiro e só depois ativa; no construtor V1, salve as alterações antes de ativar; desligar não salva a edição. O estado mostrado é o confirmado pelo servidor. Falhas mantêm o estado anterior e uma orientação visível, inclusive no histórico. No Histórico, ativar com rascunho pendente exige voltar ao editor; não há salvamento indireto. Ativação inválida fica bloqueada; pausar continua disponível mesmo com campos inválidos.

Nos modos de edição, a barra superior contém **Salvar**; no Histórico, nome fica somente leitura e Salvar fica oculto, preservando o rascunho. A barra indica alterações não salvas. Pendências aparecem no corpo do editor, fora do cabeçalho, mantendo Salvar/Ativar bloqueados enquanto houver dados inválidos. Se o canvas V1 foi salvo e a confirmação da versão falhou, a barra informa a confirmação pendente. Clicar em Salvar repete somente a leitura antes de permitir outra gravação; o rascunho é preservado. O botão mantém o texto **Salvando** durante a gravação; o toggle mostra **Ativando** ou **Pausando** durante a mudança de status. Ambos bloqueiam cliques repetidos.

No desktop, o formulário e o conteúdo da prévia rolam separadamente, mantendo a barra comum e as abas visíveis. A trava de rolagem externa só se aplica ao ambiente de edição a partir de 1024px; mobile continua com rolagem natural, e galerias/modais mantêm sua área de navegação.

O impacto de salvar uma regra ativa aparece junto da ação: no V2, envios pendentes da versão anterior são cancelados pelo comportamento já existente; no Instagram, jornadas iniciadas podem continuar com seu snapshot anterior. Não há confirmação baseada em uma contagem inventada de pendências: o contrato atual não fornece essa contagem.

O painel usa as rotas autenticadas existentes. Instagram prepara um único ID por `POST /flows`, salva por `PUT /flows/:id/quick-update` com `activate:false` e só então solicita ativação. Facebook salva com a revisão esperada e ativa usando a revisão devolvida. Se salvar funcionar e ativar falhar, o editor mantém ID/configuração, abre o endereço do registro salvo e permite tentar ativá-lo sem criar outra automação.

Revalidações de uma regra limpa recebem o snapshot mais recente. Durante uma edição local, não substituem os campos; a versão esperada continua protegendo contra sobrescrita concorrente. A prévia não marca a automação como alterada.

## Validação desta revisão

Testes de componentes e contratos cobrem organização das respostas, prévia e navegação, gate, hidratação limpa/edição local, barra de ações, erro HTTP, revisão, pausa sem regravação e repetição após falha parcial. A conferência no navegador usa apenas o ambiente local do perfil Escorpiano, sem salvar, ativar ou enviar mensagens reais. Nesta revisão visual inicial, Repost e credenciais mantiveram seus contratos; a ampliação posterior de alternativas privadas está descrita abaixo.


## Refinamento visual de 28/10, segunda rodada

Conta/Página exibe avatar e indicador dentro do seletor. O status reflete a consulta de prontidão da conta selecionada; quando faltam permissões, o ícone abre Credenciais em outra aba, preservando a edição. As informações completas de autorização e a ativação do recebimento do Messenger continuam em Credenciais.

A galeria abre pelo ícone de expansão na linha de Publicações específicas. O resumo dos IDs fica dentro de Dark Post/publicação por ID, junto da localização. Posts publicados, Dark Posts e recuperados por ID podem continuar na mesma seleção; alternar modos e voltar conserva a seleção local. Os badges não afirmam que uma publicação está em anúncio pago.

A prévia usa controles de publicação/comentários/DM por ícone abaixo do telefone, com nomes acessíveis. O foco nos campos escolhe a etapa e a alternativa ilustrada. Instagram usa a conversa escura; Facebook mostra a área de mídia e a folha de comentários; Messenger usa conversa clara, balões cinza e controles azuis. Avatar de participante é ilustrativo e local. Qualquer publicação e próxima publicação mostram seu escopo, sem pedir seleção. Navegar na prévia não grava nem envia.

A resposta pública continua antes da privada e é identificada pelo seu toggle. Mensagens privadas aceitam até dez alternativas, com variáveis inseridas no cursor conforme motor/gatilho. Uma execução entrega uma alternativa completa, que pode ter seu próprio botão/link. Configurações anteriores com `dmMessages` e botão comum continuam compatíveis. Isso não garante evitar restrições da Meta nem representa uma sequência de mensagens. A configuração e seus limites também estão na API/MCP.

Rotas canônicas: `/automations`, `/automations/[id]` (V2), `/automations/instagram/[id]` (V1), `/automations/new`, `/automations/instagram/new`, `/automations/reposts/...` e `/automations/logs`. As rotas antigas em `/automacoes` redirecionam mantendo parâmetros repetidos, `view` e `tab`. O antigo segmento `compartilhada` identificava o editor V2 compartilhado entre canais; não era compartilhamento público. Ele foi removido da rota canônica, sem mudar a autenticação nem os endpoints da API.

No Instagram, o gerenciamento de IDs fica dentro do card de Publicações específicas (também quando o item selecionado é um agendamento). Aliases existentes são aditivos e não são excluídos ao alternar modos; qualquer/próxima publicação indicam quando permanecem ativos. O switch da resposta pública e suas variações usam diretamente a etapa verde. O pedido para seguir também usa switch, com apenas as subetapas expansíveis delimitadas. Com mais de uma alternativa privada, cada texto e seu botão/link ficam em um box próprio; a ajuda do link fica à direita da linha do botão.

Ao focar um texto, uma barra oferece emojis, contador e variáveis apenas quando o motor interpreta aquele campo. A abertura e a verificação de seguidores oferecem apenas emojis. Inserções respeitam a seleção e o limite do campo; os menus fecham por Escape ou clique fora. Consulte [ferramentas de texto no foco](../automacoes-instagram.md#ferramentas-de-texto-no-foco).

## Etapas e pendências no editor rápido

O formulário usa grupos numerados com cor, ícone e resumo por etapa. Conta, origem, condições, resposta pública, mensagem privada, seguidores e ajustes adicionais aparecem conforme os recursos do gatilho. Messenger não ganha seleção de publicação, resposta pública ou seguidores; Story mantém seu escopo próprio. Os grupos começam abertos e podem ser recolhidos pelo cabeçalho sem desmontar os campos ou perder a edição. A cor é complementar ao título e à numeração.

As pendências reais de configuração aparecem em um único card abaixo do telefone, substituindo dicas genéricas e a lista acima do formulário. O card acompanha a mesma validação que impede salvar/ativar e some quando não há pendências. Com pendências, a escala do telefone se ajusta para que o card permaneça visível. Carregamento, troca de aba ou estado bloqueado não criam avisos artificiais. No construtor sem telefone, a lista permanece acessível no corpo; histórico não exibe pendências do editor.

No seletor da conta, autorização indisponível usa um triângulo de alerta. Hover e foco abrem ajuda flutuante, sem mover o layout; Escape/saída fecham. O próprio ícone continua abrindo Credenciais em outra aba, inclusive quando apenas a seleção da conta está bloqueada. O indicador pronto continua refletindo a consulta de prontidão existente, sem inferir conexão a partir do estado ativo da automação.


## Paleta compartilhada das etapas

Gatilho/conta usa ardósia, origem azul, condições âmbar, resposta pública esmeralda, mensagem privada violeta e seguidores ciano. Cores são complementares aos ícones, títulos e números. O fundo suave permanece ao recolher/expandir; o corpo usa a superfície interna do tema, branca no claro.

Os tokens de `automation-colors.scss` também definem as cores dos nós compartilhados V1/V2 e da paleta/minimapa do construtor legado. Selecionar um nó realça sua própria cor. O gatilho reúne conta e origem no canvas existente e usa ardósia; o pedido para seguir aparece em badge ciano quando configurado. Extras/espera e as saídas semânticas de condições preservam suas identidades. O tema escuro mantém as mesmas famílias com fundos escuros e texto auxiliar claro.

Os construtores V1 e V2 acompanham o tema claro/escuro da página sem remontar o canvas; seleção e edição permanecem preservadas.
