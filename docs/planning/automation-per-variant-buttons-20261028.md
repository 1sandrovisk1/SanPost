# Dark Posts e respostas por alternativa

## Escopo

Corrigir o agrupamento dos IDs de Dark Posts Instagram dentro de Publicações específicas; preservar a semântica aditiva atual dos aliases ao alternar modos, sem remover registros nem alterar o matcher. Agrupar toggle e campos de resposta pública no mesmo box cinza nas duas redes.

Permitir que cada alternativa privada contenha texto e botão próprios. O editor oferece um botão/link opcional por alternativa, com remoção, limite e prévia correspondentes. Continua sendo uma única alternativa entregue por execução, não uma sequência de envios.

## Contrato aditivo

- Configuração rápida pública/REST/MCP: `dmVariants?: {message:string,buttonText?:string,buttonUrl?:string}[]`.
- Canvas V1/V2: `SEND_DM.variants` com o mesmo formato.
- De uma a dez alternativas; texto não vazio até 2.000, ou 640 com botão; botão opcional exige título e URL HTTPS pública, título até 20. Campos desconhecidos recusados. Nenhuma interpolação nova de botão.
- Preservar `dmMessage`, `dmMessages` e botão comum antigos. Não misturar representações com `dmVariants`; PATCH de outros campos conserva os dados. Substituir por dmVariants limpa o singular/lista/botão comum anteriores; substituir por singular/lista limpa dmVariants. Alteração de botão em regra por alternativas exige substituir os objetos, sem aplicar um botão global silencioso.
- Rápido/canvas, DTOs/schema/capabilities, extrações, criação/edição, guardas de compatibilidade e validação devem representar todos os campos. Sem migração de banco.

## Execução

V2 escolhe o objeto inteiro na ingestão de comentário/Messenger e congela texto e botão em snapshot.actions. Não sortear nem montar o botão depois da escolha. Validar o pior caso dos caminhos e o texto interpolado com o botão efetivamente escolhido; vários SEND_DM continuam compostos em uma resposta, com a semântica existente do último botão.

V1 usa novo `patched('private-message-button-variants-v1')` somente para o campo novo, conservando o patch anterior de dmMessages e replays que antes ignoravam variants. Escolha pura/estável por execução/nó, sem consumir RNG público. Gate congela texto e botão escolhidos no PendingPostback; clique/retry não escolhe de novo. Limites após interpolação e da composição aplicam-se ao caminho novo. Não reconstruir conteúdo do histórico V1 a partir da regra atual.

## Verificação e operação

Backup privado de fontes/runtimes. TDD: agrupamento dos aliases e resposta pública; edição, adição/remoção e prévia de CTA por alternativa; schema/DTO, combinações ambíguas e URL; PATCH omitido/singular/lista/objetos; planner seleciona pares íntegros e valida todos os caminhos; snapshots e versão Temporal/gate. Revisões de plano/código/segurança/documentação/aceitação conforme CLAUDE; builds e navegador local apenas Escorpiano, sem salvar ou enviar regras reais. Aplicar builds Nest completos/coerentes com o contêiner parado; não sobrepor runtime parcial de versões diferentes. Documentação pt-BR e CHANGELOG atualizados.

Aliases existentes continuam aditivos em all/next, com nota compacta no escopo selecionado e gerenciamento dentro de específicas. Bounds V2 ramificam por objeto inteiro, mantendo estados com/sem botão separados; 2.000 sem botão e 600 com botão são alternativas válidas no mesmo nó.


## Resultado e validação

Implementado no rápido e nos dois inspetores. O card específico Instagram mantém os IDs visíveis também quando representa um alvo agendado. Não houve migração ou mutação de aliases ao alternar modos.

- 323 testes de interface aprovados (43 arquivos), incluindo agrupamento e round-trip de CTA individual.
- 186 testes de domínio/API/MCP aprovados nas suítes afetadas (166 da rodada completa e 20 regressões diretas adicionais do serviço V1; sua suíte passou 68/68).
- 10 testes do workflow V1 aprovados, com replay antigo, estabilidade e snapshots do gate.
- TypeScript frontend, build Next e builds Nest completos backend/orchestrator aprovados.
- Revisões de plano, código, segurança, documentação e aceitação concluídas; sem alterações nos CLAUDE.md.
- Navegador local: aliases dentro do card, resposta pública no box cinza e duas alternativas com CTAs distintos na prévia. Rascunho visual de prova não foi salvo nem ativado; console sem erros/avisos.
- Runtime local aplicado a partir de builds completos com contêiner parado e backup privado; backend, frontend e worker responderam 200. REST/MCP anunciam dmVariants; a regra real do usuário permanece ACTIVE, revisão 3, sem qualquer diferença no detalhe antes/depois.

Evidências visuais locais em `output/instagram-aliases-grouped-20261028.png` e `output/private-variants-buttons-20261028.png` (fora do Git). Nenhum novo envio à Meta foi realizado nesta rodada.
