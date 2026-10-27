# Continuidade do criador Facebook/Instagram — 22/10/2026

## Estado entregue localmente

Branch `codex/facebook-shared-automations`, HEAD base `b6686fe0`. Alterações ainda não commitadas, incluindo incrementos anteriores do onboarding/prova privada. Não descartar a árvore de trabalho. `graphify-out/GRAPH_REPORT.md` e `graphify-out/graph.json` já estavam alterados e não pertencem à feature.

O criador compartilhado está instalado no Docker e acessível pelo painel. Reutiliza os componentes de nós do Instagram, com editor simples, editor visual, seleção de posts por canal, ativação/pausa e histórico. O motor V2 usa eventos, outbox, Temporal e reserva durável dos efeitos. A configuração comum aceita até uma Página Facebook e uma conta Instagram por automação; cada Página adicional pode usar outra automação do mesmo aplicativo Meta. Stories, follow-gate e postback permanecem no legado.

Referências: [contrato e execução](facebook-shared-creator-execution.md), [manual do usuário e operação](../operations/facebook-shared-automations.md), [onboarding Meta](../operations/facebook-automation-panel.md).

## Escopo autorizado da homologação real

| Identificador | Valor |
|---|---|
| Perfil | Escorpiano — `0818f364-7b29-49af-87f6-9220ad2b3db9` |
| Organização | `12792a7b-75da-45cb-a11d-9f980aeb5df2` |
| Integração | `cmvi6us6q0005pm090b98kalb` |
| Página | Escorpião Veneno — `271852286004401` |
| Aplicativo | `841571281566716` |
| Post | `271852286004401_122321127302221279` |
| Automação criada pelo painel | `c653c56a-3426-41d2-8ce5-29b3cb86df47` |
| Estado confirmado | `ACTIVE`, revisão 2, versão de execução 2 |
| Ativação | 22/10/2026 17:56:11 America/Sao_Paulo |

Mensagem aprovada: “Teste do MultiPost: seu comentário chegou. Aqui está o link: https://www.facebook.com/share/p/1DsHnUeoAy/”. Apenas o canal Facebook e esse post estão selecionados. Sem palavras-chave e sem resposta pública. A automação está ativa para comentários novos elegíveis; não habilitar outras Páginas nem o Instagram para provas reais.

O comentário `122321127302221279_1740025530415851` já foi respondido pela prova manual anterior, cujo recebimento foi confirmado pelo usuário. Não reutilizá-lo, remover seu ledger ou fabricar webhook. O usuário fez um comentário novo e o envio automático V2 foi aceito pela Meta. Evidência abaixo; em 22/10/2026, o usuário também confirmou o recebimento da nova mensagem com o link no Messenger, concluindo a prova de ponta a ponta.

## Runtime, dados e retomada

- Imagem ativa após a revisão de 23/10: `multipost-facebook-local:ui-cleanup-20261023`, também marcada como `:source`. Identificador e validação final registrados na seção de correções abaixo.
- Imagem anterior preservada para rollback da interface: `multipost-facebook-local:shared-creator-20261022`, SHA `395920ec9cd1ceca4102326707d4799fca3fe78749946a49e45d77f92473e540`. Também permanece `multipost-facebook-local:panel-proof-20261022`, SHA `3368425df0631292cd98f40bdb3da2a8e3df954a73293a55b8ebd4fd1b36e848`.
- Banco recuperado: `multipost_restored_20261020`. Backup privado anterior ao DDL: `.secrets/backups/pre-shared-creator-20261022.dump`, acompanhado de listagem e checksum. Não publicar esses arquivos.
- Migração aditiva `20261022_shared_comment_automations` aplicada em transação. É obrigatória antes do binário novo, inclusive com V2 desabilitado. Não remover schema/ledgers para rollback.
- `SHARED_AUTOMATIONS_ENABLED=true`, `SHARED_AUTOMATION_TEST_INTEGRATION=cmvi6us6q0005pm090b98kalb`, `RUN_CRON` vazio. Bloqueio de teste aplicado à ativação, ingestão e envio.
- Dispatcher `comment-automation-dispatch-v2` confirmado `RUNNING` no Temporal, com atividades executadas. Não há necessidade de clicar em “verificar recebimento” a cada comentário.
- Correção local de memória: frontend em Turbopack, healthcheck de arquivo estático. Criador, calendário, configurações e lista de automações renderizados com a sessão existente. Amostras de 2,9–3,9 GiB e zero reinicializações após a recriação observada; não equivale a teste prolongado.

Para subir a stack preparada, a partir da raiz:

```bash
docker compose --env-file .secrets/multipost-local.env \
  -f docker-compose.local.yaml -f docker-compose.tunnel.yaml \
  -f docker-compose.restored.yaml -f docker-compose.meta-proof.yaml \
  up -d --no-build
```

O túnel Cloudflare é o serviço já instalado no Mac. O comando não o reconfigura nem reconstrói a imagem. Não usar `down -v` ou executar `schema` sobre o banco recuperado sem revisar o procedimento de migração.

## Validações da entrega inicial — 22/10/2026

| Verificação | Resultado | Evidência local ignorada pelo Git |
|---|---|---|
| Regressão backend/Instagram/Facebook/V2 | 488 aprovados, 5 de banco explicitamente pulados | `tmp/shared-regression-final.log` |
| Validade do token | 34 aprovados; inclui um caso novo após a regressão | `tmp/shared-token-tests.log` |
| PostgreSQL 17 real, base isolada | 5 aprovados | `tmp/shared-postgres-tests.log` |
| Interface, canvas e datas | 13 aprovados | `tmp/shared-ui-tests.log` |
| Workflow | 3 aprovados | `tmp/shared-workflow-tests.log` |
| Build backend e orchestrator | Aprovados | `tmp/shared-backend-build.log`, `tmp/shared-orchestrator-build.log` |
| TypeScript completo frontend | Aprovado | `tmp/shared-frontend-tsc.log` |
| Navegador | Criação, persistência e ativação; Facebook exclusivo, texto, post e validade conferidos | `tmp/facebook-shared-creator-active-20261022.png` |

O banco de testes `multipost_shared_test_20261022` é separado e contém apenas fixtures artificiais. Não rodar testes destrutivos sobre o banco recuperado. Chamadas Meta dos testes automatizados são simuladas; testes de contrato HTTP usam Nest real em localhost. Houve revisão de plano, código, segurança e documentação. Propostas de mudanças em CLAUDE.md não foram aplicadas.

## Tokens: fato verificado e limite

A consulta à Meta para a autorização do Escorpião retornou token válido, tipo PAGE, `expires_at=0` e prazo de acesso aos dados até 19/01/2027 21:18:20 America/Sao_Paulo. O painel diferencia os dois prazos. O login OAuth obtém a autorização; não depende de token de uma hora colado pelo aluno. Isso não garante validade perpétua: revogação/perda de acesso ainda exige “Renovar autorização”. Nenhum cron global foi habilitado para renovar outras contas. A rota Instagram continua usando o resolvedor canônico existente.

## Prova real automática

- Novo comentário `122321127302221279_977646852054036`, ocorrido às 18:03:18 e recebido às 18:03:23 (America/Sao_Paulo).
- Evento persistido `c5fd0c42-0b89-4709-a5ba-ab5bf5b8cf00`, somente no post e integração autorizados.
- Execução `33a3fb08-0503-4f47-a18c-bdc6e6968899`: `COMPLETED`, sem erro, às 18:03:27.
- Uma entrega `private_reply`, estado `SENT`, com ID remoto retornado pela Meta. Nenhuma resposta pública configurada.
- Despacho `STARTED` e workflow `comment-flow-v2-33a3fb08-0503-4f47-a18c-bdc6e6968899` confirmado `WORKFLOW_EXECUTION_STATUS_COMPLETED` no Temporal.
- Histórico do painel exibiu “22/10/2026, 18:03:23 · facebook · Concluída” e “Mensagem privada: Envio aceito pela Meta”.
- Captura visual local: `tmp/facebook-shared-creator-sent-20261022.png`. Console do navegador sem erros/avisos na verificação final.
- Confirmação do destinatário em 22/10/2026: o usuário respondeu “Sim, recebi a nova mensagem com o link”. A prova automática pelo criador está concluída de ponta a ponta, separadamente da prova manual anterior.

## Próximo gate

1. Prova automática concluída: aceitação pela Meta, execução persistida e recebimento no Messenger confirmados. Não reenviar o mesmo comentário.
2. Para outro teste, usar comentário novo no mesmo post autorizado; preservar o ledger. Se houver `UNKNOWN`, investigar sem reenvio automático.
3. Só depois avaliar ampliação do rollout; a liberação geral, API pública V2, SDK/CLI e conversão explícita de flows antigos continuam fora deste incremento.

O aviso local de boot `reconcileRefreshTokensCron: Temporal Service is not initialized` permanece anterior ao novo dispatcher e está documentado no guia Docker. A validação de produção/replay/rollout amplo ainda deve seguir o plano principal; o sucesso desta homologação não substitui esses gates.

## Revisão do frontend solicitada pelo usuário — 22/10/2026

Auditoria por navegação no perfil Escorpiano e leitura dos componentes alterados. A prova de entrega acima continua válida, mas não representa aprovação da experiência visual. Foram inspecionados lista, modal de criação, editor simples, canvas, histórico e configuração Facebook. O formulário temporário usado para inspeção não foi salvo; nenhuma autorização, assinatura ou automação foi alterada nesta revisão. Tema escuro e viewport do navegador embutido foram observados; responsividade móvel e tema claro ainda precisam de validação própria.

### Corrigir primeiro: informação e comportamento

1. **Gatilho representa a configuração errada.** Com Facebook e um post específico selecionados, o canvas apresenta “Comentário no Instagram” e “Todos os posts”. `SharedFlowCanvas` reutiliza `TriggerNode` sem passar o contexto dos canais; o nó antigo deduz os posts do config legado. A seleção persistida continua no canal V2, mas a representação visual induz erro. Adaptar a apresentação do nó ao contexto compartilhado, preservando o contrato legado.
2. **Conexão parece perder a configuração.** `FacebookAutomationSetupRepository.saveStatus()` guarda o diagnóstico por 300 segundos; após expirar, a tela usa `CHECK_REQUIRED`. Observado pedido de verificação ao lado do recibo real bem-sucedido. Distinguir diagnóstico desatualizado de conexão inválida, preservar a última confirmação e oferecer atualização somente leitura. Não interpretar expiração desse cache como expiração do token.
3. **Dois caminhos concorrentes para comentários.** O modal ainda diz “automação do Instagram”, mantém “Comentário em Feed/Reels” selecionado e acrescenta um botão destacado “Comentários no Facebook e Instagram” que navega para outra tela. Criar uma entrada coerente por objetivo e plataforma/capacidade; recursos exclusivos do Instagram devem continuar disponíveis com identificação clara.
4. **Rótulo de mensagem pública incorreto no canvas.** O formulário de `REPLY_COMMENT` usa `shared_message`, traduzido como “Mensagem privada”. Usar o rótulo correspondente à ação.
5. **Link de configuração usa Facebook para qualquer canal.** `ChannelPosts` sempre monta `facebookAutomation=<integrationId>`, inclusive para Instagram. Achado de código; não foi provocado login/renovação real do Instagram. Selecionar o destino correto por plataforma e preservar o canal ao retornar ao criador.

### Reduzir poluição e alinhar a experiência

6. **Lista dividida em duas linguagens visuais.** V2 aparece como card acima da tabela antiga; quando só existe V2, sobra o cabeçalho da tabela vazia. Os cards também não oferecem as mesmas ações/indicadores. Unificar a apresentação, mantendo o roteamento de cada versão para seu editor compatível.
7. **Credenciais viraram um manual sempre aberto.** Introduções repetidas, App/Page/Post/Comment IDs, callback, token de verificação, três etapas concluídas e a prova manual anterior competem com a ação principal. Exibir resumo por Página, estado e próxima ação; recolher configuração do aplicativo, detalhes técnicos e diagnóstico. O teste manual concluído deve ficar em diagnóstico, separado da criação cotidiana.
8. **Conexão saudável ocupa espaço de criação.** O editor repete explicações sobre token e prazo acima dos posts. Exibir estado compacto; mostrar alerta quando há providência necessária e validade em detalhes da conexão. O aviso sobre prazo de dados deve continuar acessível, sem parecer erro permanente.
9. **Formulário sem hierarquia suficiente.** Textos auxiliares, títulos, bordas e botões têm peso parecido; ações ficam no topo, longe da mensagem. Organizar “Canais e publicações → Quando responder → Mensagem → Revisão/ativação”, com prévia da mensagem. Reutilizar/adaptar os componentes existentes do assistente Instagram, inclusive a prévia, mantendo os limites de cada plataforma.
10. **Canvas mal acomodado e com baixo contraste.** Observados textos escuros sobre fundo escuro e controles brancos sem ícones legíveis. O canvas de 560px fica abaixo de um formulário longo; rolar sobre ele altera o zoom, e dois nós chegam a ocupar quase toda a largura no fit inicial. Dar área própria ao editor visual, limitar zoom inicial, configurar rolagem e aplicar tema coerente. O painel lateral fixo de 280px também exige revisão responsiva.
11. **Posts exibem identificadores em vez de contexto útil.** `caption` e ID aparecem, enquanto `timestamp` e `permalink` já existem no DTO mas não são usados. Priorizar miniatura, trecho, data e “Abrir publicação”; mover ID para detalhe. Exibir carregamento, ausência de posts e falhas separadamente.
12. **Histórico e validação insuficientes para uso cotidiano.** Histórico fica no fim do formulário, não atualiza automaticamente e ignora `error` recebido pela API; o usuário vê estado sem a orientação necessária. Campos obrigatórios falham por toast geral, sem destaque local. Separar acompanhamento em aba/painel com carregamento/erro/atualização explícitos e adicionar validação contextual no editor. A lista V2 também precisa de tratamento de erro e ação de arquivar compatível com o backend.

### Ordem proposta para o próximo incremento

1. Corrigir representação do gatilho, estado de conexão, rótulos e links por plataforma.
2. Unificar entrada de criação e apresentação da lista, preservando os flows existentes.
3. Simplificar credenciais por estado e recolher diagnóstico/prova manual.
4. Organizar editor simples com prévia; ajustar canvas, tema e histórico.
5. Cobrir com testes de UI os estados hoje ausentes: conexão com cache expirado, canal Facebook/post específico no nó, resposta pública corretamente nomeada, lista somente V2, link Instagram e detalhes de falha. Validar no navegador tema claro/escuro e larguras desktop/móvel. Qualquer nova prova real continua restrita ao Escorpiano.

Evidências locais sem credenciais: `tmp/facebook-ui-audit-modal-20261022.png` e `tmp/facebook-ui-audit-canvas-20261022.png`. Este registro é o diagnóstico e a proposta de correção; não declara os problemas corrigidos.

## Correções de interface aprovadas — 23/10/2026

Implementação concluída na ordem dos 12 achados: contexto correto do gatilho; diagnóstico estável; entrada única; rótulos; links por plataforma; lista unificada; credenciais resumidas; conexão compacta; editor com hierarquia e prévia; canvas legível; seleção de posts; histórico e validação. O fluxo V1 e seus recursos exclusivos continuam disponíveis. Nenhuma alteração de regras, envio ou assinatura em outras contas.

Contrato adicional: `POST /facebook-automations/:integrationId/check`, sem corpo, ADMIN e escopo organização/perfil, retorna `FacebookSetupStatus`, `Cache-Control: no-store`. Consulta token, callback e inscrição sem efetuar inscrição ou enviar mensagens; grava apenas diagnóstico local. O diagnóstico é retido por 30 dias, vinculado à credencial atual e identificado pela data da última verificação. `lastReadyAt` guarda uma confirmação anterior quando há falha de consulta, sem convertê-la em autorização atual. Ativação e envio continuam fazendo validação atual. OAuth continua com TTL de 10 minutos.

### Comportamento entregue

- **Lista e entrada:** uma tabela para V1/V2 e “Responder comentários” como entrada principal. Stories e recursos exclusivos do Instagram permanecem identificados no modal. Histórico V2 abre diretamente em sua aba; arquivamento exige confirmação e preserva as execuções. Não se cria um flow legado apenas por abrir o novo criador.
- **Credenciais:** resumo por Página com próxima ação; configuração do aplicativo e diagnóstico/prova manual recolhidos. “Verificar conexão” consulta a Meta sem renovar autorização, alterar assinaturas ou enviar mensagens. A consulta real do Escorpiano em 23/10 às 07:37:49 retornou “Recebimento configurado”, mantendo o último comentário de 22/10 às 18:03:23.
- **Criador:** canais/publicações, quando responder e mensagem; prévia reaproveitada do Instagram; resposta pública opcional; botão com link em detalhe. Campos inválidos recebem orientação local e link para o nó quando aplicável. Rascunhos usam proteção `beforeunload` ao recarregar/fechar ou abandonar o documento; isso não intercepta toda navegação interna do Next. Links de conexão abrem em outra aba. Canal salvo que deixou de estar disponível pode ser removido do rascunho.
- **Canvas:** gatilho mostra Facebook/Instagram e a seleção real de posts. Tema acompanha a aplicação, zoom inicial limitado e roda do mouse rola a página. Inspeção funciona em automação ativa sem habilitar edição. O painel de propriedades fica abaixo em larguras menores.
- **Posts e histórico:** miniatura, legenda, data e link no lugar de IDs em destaque; estados separados para carregamento, vazio e erro. Histórico atualiza enquanto sua aba está montada, orienta falhas sem expor erros brutos e não oferece reenvio em resultado incerto.
- **Correções encontradas visualmente:** cores secundárias usam o token com suporte a transparência; canvas mantém altura em layout vertical; links longos quebram na prévia; a largura da lista e das credenciais respeita o conteúdo disponível. A tabela usa rolagem horizontal quando necessário.

### Validação de 23/10/2026

| Verificação | Resultado | Evidência local ignorada pelo Git |
|---|---|---|
| Regressão Instagram/Facebook/V1/V2 | 492 aprovados, 5 de PostgreSQL explicitamente pulados | `tmp/ui-cleanup-regression.log` |
| Interface e datas | 32 aprovados, 9 arquivos | `tmp/ui-cleanup-ui-final.log` |
| TypeScript frontend | Aprovado | `tmp/ui-cleanup-tsc-final.log` |
| Build backend e orchestrator | Aprovados | `tmp/ui-cleanup-backend-build.log`, `tmp/ui-cleanup-orchestrator-build.log` |
| Revisão independente | Plano, código, segurança e documentação revisados; correções solicitadas incorporadas | Resumos no chat desta implementação |
| Imagem Docker | Construída e instalada localmente | `tmp/ui-cleanup-docker-build.log`, `tmp/ui-cleanup-install.log` |

O ciclo RED/GREEN cobriu representação do gatilho, diagnóstico vinculado à credencial, verificação somente leitura, validação contextual, erros de domínio HTTP 409, canal indisponível e variáveis da prévia. Os cinco testes PostgreSQL não foram repetidos nesta revisão sem mudança de schema/repositório V2; a execução isolada de 22/10 está registrada acima. Não houve nova migração, limpeza de dados ou alteração dos ledgers.

### Browser Validation

Navegação autenticada apenas no perfil Escorpiano, no navegador embutido a 918 × 984. Foram conferidos lista, modal, editor simples com prévia, canvas/inspeção em modo ativo, histórico e resumo Facebook. O histórico continua mostrando a execução concluída de 22/10; nenhuma mensagem nova foi enviada na revisão visual. O botão de verificação somente leitura do Escorpiano foi validado. As demais contas e o Instagram real não foram autorizados, ativados ou usados para envios.

Criador e canvas conferidos nos temas claro e escuro; tema escuro original restaurado ao final. A inspeção em 918 × 984 confirmou o layout em coluna do inspetor, a prévia ao lado do formulário e a rolagem independente da tabela. Não houve emulação de celular nem validação física em dispositivo móvel; esse é um limite da prova visual realizada.

Capturas sem tokens de acesso: `tmp/facebook-ui-cleanup-creator-20261023.png`, `tmp/facebook-ui-cleanup-creator-light-20261023.png`, `tmp/facebook-ui-cleanup-entry-20261023.png`, `tmp/facebook-ui-cleanup-list-20261023.png`, `tmp/facebook-ui-cleanup-settings-20261023.png`, `tmp/facebook-ui-cleanup-canvas-dark-20261023.png`, `tmp/facebook-ui-cleanup-canvas-light-20261023.png` e `tmp/facebook-ui-cleanup-history-20261023.png`.

Imagem final da limpeza instalada `multipost-facebook-local:ui-cleanup-20261023`, SHA `c1cc366acae7f113235296ac1a6908c5eead458c75024b2f8eb5d465174e1030`. Container `multipost-facebook-local-app-1` saudável e com zero reinicializações na conferência final. Essa observação não representa teste prolongado de estabilidade.

### Ajuste incremental: abas Meta (23/10/2026)

Após adiar o redesign, o usuário autorizou somente substituir as três seções empilhadas por abas Facebook/Instagram/Threads dentro do box Meta existente. Cabeçalhos ocupam um terço da largura, com ícones originais. Conteúdo, handlers, configuração inicial, rascunhos e links diretos foram preservados; os painéis inativos continuam montados. Navegação acessível por setas/Home/End. Nenhuma mudança de backend, token, webhook ou automação.

- Validação: cinco testes novos falharam antes da implementação e passaram depois; suíte de interface com 37 testes aprovados e TypeScript frontend aprovado. Registros: `tmp/meta-tabs-red.log`, `tmp/meta-tabs-ui.log`, `tmp/meta-tabs-green.log`, `tmp/meta-tabs-tsc.log`.
- Imagem desta primeira etapa: `multipost-facebook-local:meta-tabs-20261023`, SHA `e093245eb00b2d1573383b5d6f9e776dde4ef215c3f5bdaa939c6cdebab2860a`. Camada incremental sobre `:ui-cleanup-20261023` contendo somente `meta-credentials.component.tsx`; demais componentes e serviços permanecem na versão anterior.
- Atualizado apenas o serviço `app`, com `up -d --no-deps --no-build app`. Banco, volumes, receptor auxiliar e credenciais preservados. Container saudável, zero reinicializações na conferência. Rollback desta alteração visual: restaurar a tag `:source` a partir de `:ui-cleanup-20261023` e recriar somente `app` com os mesmos overlays.
- Validação visual na sessão Escorpiano: alternância das três abas confirmada no navegador, temas claro/escuro conferidos, credenciais mascaradas e estado de recebimento preservados. Prints reais em `output/meta-tabs-20261023/facebook.png`, `instagram.png` e `threads.png`. Nenhuma ação de editar/salvar/testar credenciais, ativar recebimento ou enviar mensagem foi executada.

### Refinamento visual das abas (23/10/2026)

A pedido do usuário, retirados a lista de redes ao lado de Meta e o nome/ícone repetidos dentro de cada painel. As abas continuam com um terço da largura; a selecionada se une ao painel pela mesma cor de fundo e pela abertura da borda inferior, como uma ficha. Descrições e ações permanecem; Threads não ganha linha vazia quando não há ações/descrição. Montagem dos painéis, rascunhos, teclado e ARIA preservados.

- Testes existentes: 37 aprovados; TypeScript frontend aprovado. Logs `tmp/meta-tabs-joined-ui.log` e `tmp/meta-tabs-joined-tsc.log`. Nenhum novo teste de backend para esta alteração visual.
- Imagem local atual: `multipost-facebook-local:meta-tabs-joined-20261023`, também `:source`, SHA `0fb297d9884e0cdde9fe5c8d12ed0378350746dbda72a245ed49bc5c222ff984`. Somente o componente visual foi substituído sobre `:meta-tabs-20261023`.
- Recriado somente `app`, sem dependências nem migrações. Rollback deste refinamento: marcar `:meta-tabs-20261023` como `:source` e recriar somente `app` com os mesmos overlays.
- Conferência no navegador: três abas alternam corretamente, sem nome/ícone duplicado no conteúdo; junção de bordas confirmada em tema claro e escuro. Prints em `output/meta-tabs-joined-20261023/{facebook,instagram,threads}.png`. Sessão Escorpiano usada somente para leitura visual; nenhuma credencial, autorização ou automação alterada. Container saudável e zero reinicializações na conferência.

Para reverter somente o aplicativo local, remarcar `multipost-facebook-local:shared-creator-20261022` como `multipost-facebook-local:source` e executar o comando compose desta documentação acrescentando `--no-deps app`. Preservar banco, Redis, Temporal e ledgers. Não usar `down -v`. Nenhum commit, push, PR ou deploy de produção foi realizado neste incremento.


### Organização da aba Facebook com ajudas contextuais — 23/10/2026

- Escopo: somente a aba Facebook. Aplicativo Meta e Automação da Página separados por título/divisor; ajudas locais para o aplicativo compartilhado e a URL de retorno OAuth. Ações renomeadas para **Testar credenciais** e **Verificar Página**, mantendo seus endpoints e efeitos anteriores.
- O recebimento pronto aparece como selo verde discreto, sem caixa de sucesso. Pendências usam alerta amarelo; falhas usam vermelho e não mostram o sucesso histórico como estado atual. O alerta de conflito informa fora da área avançada que mudar o callback afeta as demais Páginas inscritas no aplicativo.
- **Configuração avançada** contém **Webhook do aplicativo** e **Diagnóstico e autorização**. Concluir configuração abre o webhook diretamente. Trocar a Página fecha ambas as seções e desmonta a prova manual; abrir uma ajuda não envia formulário nem executa ações na Meta.
- `FacebookHelp` reutiliza `react-tooltip` já instalado, com mouse/foco/toque, Escape e clique fora, largura limitada à tela e cores dos temas existentes. Nenhuma dependência nova nem alteração no tooltip global. As instruções necessárias e os alertas continuam visíveis fora dos tooltips.
- TDD: novos cenários de conflito/abertura do webhook, falha atual versus histórico, troca de Página e ajudas falharam antes da implementação (`tmp/facebook-help-red.log`). Resultado final: **42 testes aprovados em 11 arquivos**, incluindo abas/rascunhos do Instagram e criador compartilhado; TypeScript frontend aprovado (`tmp/facebook-help-ui.log`, `tmp/facebook-help-tsc.log`). O setup JSDOM fornece CSS/ResizeObserver ausentes sem simular a lógica dos tooltips; testes aguardam a exibição efetiva antes do clique externo.
- Imagem local: `multipost-facebook-local:facebook-help-20261023`, também `:source`, SHA `b1b5803fb00e325911f541b962935617b431fe09fac890f7dae0accc3cd80bc4`. Camada incremental sobre `:meta-tabs-joined-20261023`, contendo os três componentes frontend afetados e traduções pt/en. Recriado somente `app`, sem migrações nem recriação das dependências.
- Rollback deste refinamento: marcar `multipost-facebook-local:meta-tabs-joined-20261023` como `:source` e recriar somente `app` com os mesmos overlays. Nenhum token, assinatura de webhook, credencial ou automação foi alterado nesta etapa.
- Validação visual real concluída na sessão Escorpiano: títulos/ações, selo de recebimento, ajuda por clique, Escape com foco preservado, clique fora e abertura/recolhimento da configuração avançada. Instagram e Threads continuam acessíveis com seus conteúdos anteriores. Tema claro e escuro conferidos; tema original restaurado. Prints reais em `output/facebook-help-20261023/{facebook,ajuda-aplicativo,ajuda-escuro}.png`. Nenhuma ação real de testar credenciais, verificar/ativar Página, renovar autorização ou enviar mensagem foi executada. Container saudável, zero reinicializações e frontend HTTP 200.


### Simplificação do webhook aberto — 24/10/2026

- Pedido: reduzir a carga de instruções na Automação da Página e no webhook expandido, mantendo o padrão atual. Alterado somente `facebook-automation-setup.component.tsx`, seu teste, traduções pt/en e documentação; sem mudanças em endpoints, tokens, inscrições ou envio de mensagens.
- Resumo: ajuda opcional no título, seletor sem espaço reservado a erro de formulário inexistente, selo com indicação discreta de verificação anterior. Datas/último recebimento ficam na ajuda do estado e no diagnóstico; confirmação histórica após falha permanece apenas como histórico.
- Webhook: lista semântica com três passos — abrir a Meta, copiar/salvar dados e ativar a Página. Caminho do menu recolhido em “Onde encontro essa opção?”, ajuda junto ao token, campos/botões compactos. Instruções de Verificar e salvar e feed continuam visíveis. Aviso do impacto compartilhado também permanece visível, inclusive o alerta de conflito fora do avançado. Com recebimento pronto, ativação usa botão secundário e Criar automação mantém destaque.
- Teste novo RED → GREEN cobre a abertura sem ativação, dados integrais/copiar callback e disponibilidade das datas no diagnóstico. Suíte: **43 testes aprovados em 11 arquivos**; TypeScript frontend aprovado. Logs: `tmp/facebook-webhook-simple-{red,ui,tsc}.log`. Revisão incremental sem bloqueadores; nenhuma mudança necessária em CLAUDE/AGENTS.
- Imagem local `multipost-facebook-local:webhook-simple-20261024` (também `:source`), SHA `af1180f7fea03a091cee6e7e0580969621db655cfd91cae4f38c73a8ef184b67`. Camada incremental sobre `:facebook-help-20261023`, contendo somente o componente e os dois catálogos de tradução. Recriado somente app com os mesmos overlays, sem migração/dependências.
- Rollback: marcar `:facebook-help-20261023` como `:source` e recriar somente app com os overlays locais habituais.
- Conferência real na sessão Escorpiano: lista de três passos, campos com labels, instruções essenciais e botão final delimitado; ajuda do token abre por clique e fecha com Escape; caminho da Meta abre em “Onde encontro essa opção?”. Screenshot da versão final em `output/facebook-webhook-simple-20261024/webhook.png`. Somente leitura/expansão de controles, sem verificar/ativar Página, alterar credencial ou enviar mensagem. Container saudável, zero reinicializações e frontend HTTP 200.
