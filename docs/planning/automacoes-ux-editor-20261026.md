# UX das automações — 26/10/2026

## Decisão e limites

Reaproveitar a apresentação e os controles, mantendo Instagram e Facebook separados na criação e na execução. A análise visual recebida é uma referência; não define capacidades da API.

O Instagram rápido usa `quick-create`/`quick-update` e ativa novas regras ao salvar. O Facebook/V2 separa rascunho e ativação e protege edições por revisão. Repost tem editor e execução próprios. Não unificar esses contratos nesta revisão visual. Também não chamar mensagem do Messenger de resposta a Story: não há atribuição comprovada ao Story.

## Primeiro incremento

- Um seletor de gatilhos, com filtros Instagram/Facebook, no lugar dos dois modais. Nome e conta são preenchidos uma vez, no editor. Escolher um gatilho apenas navega: não cria registro vazio.
- Instagram comentário/Story abrem os editores rápidos existentes em modo novo. Repost mantém seu editor. Facebook comentário/Messenger usam o mesmo editor V2 com o gatilho inicial correto. Parâmetros de criação não alteram regras já salvas.
- Nomes iniciais editáveis, conforme rede e gatilho. Botão de criação do Instagram informa que cria e ativa, preservando o contrato atual.
- Seletor compartilhado de conta/Página, de escolha única por rede, substituindo os checkboxes e nomes repetidos do Facebook. Regras V2 antigas com duas redes preservam ambos os canais. Trocar conta limpa apenas as publicações daquele canal.
- Organização visual consistente no editor dividido entre formulário e prévia. Prioridade do Messenger fica em configuração avançada, sem mudar a precedência do motor.
- Manter validações de conexão do Instagram no editor ao remover o modal intermediário. Falhas e carregamento têm feedback visível; respostas antigas não podem sobrescrever a conta atual.
- Dark Posts do Instagram dependem de `flowId`: no editor novo, oferecer ação explícita para preparar um rascunho (`POST /flows`, uma vez, com nome e conta). Somente depois habilitar o campo existente de aliases. O envio final usa `quick-update` desse rascunho; não cria outra regra. Fixar a conta após preparar o rascunho, como exige o contrato de atualização. Nenhuma ativação nessa preparação. Validar publicação/alias quando o escopo é específico para não cair implicitamente em qualquer publicação.

## Próximos incrementos deliberadamente separados

Galeria compartilhada de publicações, prévia completa do gate de seguidores, detector de sobreposição, histórico agregado e salvamento uniforme exigem desenho e testes próprios. Não remover aliases/Dark Posts, variações, gate, próxima publicação, editor visual ou histórico para simplificar o layout. Não mudar normalização de palavras no motor nesta etapa.

## Backup e restauração

Backup temporário das views e traduções, com alterações locais anteriores, em `.secrets/view-backups/20261026-204231-automation-ux/`. São 58 arquivos; o arquivo `manifest.json` contém SHA256 verificado contra o conteúdo de `views-before-ux.tar.gz`. Consulte o README desse diretório para restaurar arquivos isolados sem apagar trabalho posterior. Não contém banco nem credenciais.

## Validação planejada

TDD do seletor (cinco rotas, nenhuma gravação, teclado/foco), inicialização do editor e preservação de fluxos existentes; testes de troca de conta e isolamento das publicações; testes dos editores Instagram sem perder os campos específicos. Executar a suíte UI Meta, verificação TypeScript e validação no navegador em desenvolvimento, sem reconstruir imagem Docker, salvar ou ativar regras reais. Registrar capturas e resultados ao concluir.

## Implementação e correção de escopo

Entregue o primeiro incremento: seletor único com cinco entradas; editores novos sem registro antecipado; nomes sugeridos; seletor de escolha única reaproveitado nos dois canais; títulos de seções e moldura da prévia compartilhados; prioridade do Messenger recolhida; conexão verificada no editor Instagram; conta fixa após preparar rascunho; mensagens visíveis quando falta publicação/Story específico.

A revisão identificou uma correção necessária no motor Instagram V1: salvar `specific` sem posts não pode virar correspondência ampla. O serviço agora conserva explicitamente esse modo; listas vazias ou nulas não correspondem a posts orgânicos, mas os aliases continuam participando da busca separada. Não copiar IDs de aliases para o gatilho: isso impediria que remover o alias interrompesse disparos. Testes cobrem ativação via alias, remoção e reabertura do rascunho. Regras legadas sem modo explícito e modos `all`/`next_publication` preservam seu comportamento. Nenhuma migração, alteração de credencial ou de contrato DTO.

Backup das views permanece intacto. Para reverter só a apresentação, restaure arquivos selecionados; a correção de escopo do serviço é independente desse backup.

## Resultado da validação

- RED confirmado: entrada/seletores falharam antes da alteração; testes de rascunho Instagram falharam antes da implementação; dois casos de escopo/remoção de alias falharam antes da correção do serviço.
- `pnpm exec vitest run --config tools/vitest.facebook-panel.config.mts`: 165 testes em 21 arquivos aprovados. Após o ajuste final de escala da prévia, os 30 casos focais dos editores/entrada passaram novamente; teste adicional de contenção/restauração de foco também aprovado.
- `pnpm test:automations:regression --no-coverage`: 688 testes aprovados em 40 suítes; 20 casos condicionados ao ambiente em duas suítes foram ignorados pelo próprio comando. A suíte focal V1 também passou (168 casos).
- TypeScript do frontend sem erros. Builds backend/orchestrator concluídos pelo `pnpm dev:local`; mesma imagem Docker `sha256:de4e3f969a83f8b0bbb9fc5889aed501cc6cc8e48690e6d133af3cc35bbbbb00`, container saudável, sem reinícios inesperados. Houve 502 transitório durante o reinício planejado, resolvido após iniciar os serviços e recarregar.
- Navegador autenticado no Escorpiano: seletor com abas e cinco gatilhos; entrada direta Messenger; Página única e conexão verificada; palavras-chave/texto apenas na prévia; Instagram comentário com nome sugerido, posts e webhook conectado; Story abriu seu editor próprio. Sem erros/avisos de console nas abas verificadas. Não foram usados Salvar, Ativar ou Preparar rascunho no ambiente real.
- Capturas em `output/automation-ux/`: `novo-seletor-instagram.png`, `novo-seletor-facebook.png`, `editor-instagram.png`, `editor-messenger-topo.png` e `editor-messenger.png`. A última ilustra texto de teste não salvo.
- Plan-reviewer, code-reviewer e doc-maintainer concluíram as revisões. As sugestões de atualização de CLAUDE foram apenas propostas, sem aplicação. A documentação do produto foi atualizada em pt-BR.

## Ajuste de espaçamento dos selects

Setas dos selects nos editores Instagram (comentário/Story) e Facebook agora usam o mesmo recuo de 12 px à direita, com 40 px reservados para o texto. O controle permanece nativo; múltipla seleção/listboxes ficam fora da regra e o modo de alto contraste recupera a seta do navegador. A cor acompanha o texto e a opacidade do campo. Nenhuma alteração em opções, callbacks ou APIs. Backup anterior ao ajuste em `.secrets/view-backups/20261026-select-spacing/before.tar.gz`.

Validação: 31 testes focais de entrada/editores aprovados, revisão de código sem pendências e conferência visual no navegador nos dois canais, sem erros/avisos de console. Seleção da Página testada sem salvar/ativar automação. Aplicado pelo recarregamento de desenvolvimento, sem construir imagem Docker. Captura: `output/automation-ux/select-padding-facebook.png`.
