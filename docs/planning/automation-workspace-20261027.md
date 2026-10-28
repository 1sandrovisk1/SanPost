# Estrutura compartilhada dos modos da automação

## Escopo aprovado

Primeiro implementar a barra comum e as abas, preservando os editores existentes. Não reconstruir motores, migrar regras nem consolidar APIs de histórico nesta rodada.

- Uma barra contextual com voltar, nome editável (sem gravar ao perder o foco), conta/gatilho, switch confirmado e Salvar. Sem nome/status/botão duplicados no formulário, prévia ou rodapé.
- Navegação global Editor rápido / Construtor visual / Histórico, com modo na URL e tratamento de voltar/avançar. Histórico da automação permanece somente dessa regra. Eventos/comentários e histórico geral ficam fora desta mudança.
- V2 já mantém definição única entre formulário e canvas: conservar grafo, canais antigos e proteção ao formulário incompatível. Trocar de aba não grava nada.
- V1 mantém estados específicos de formulário e nós nesta primeira fase. Histórico conserva o editor e seu rascunho montados. Trocar entre os dois editores exige salvar primeiro; bloquear a troca com orientação quando houver alterações, inclusive pela URL. Ao trocar limpo, revalidar a mesma automação antes de montar o outro editor. Não converter grafo avançado para formulário simplificado.
- Rota V1 antiga continua resolvendo para o ambiente de edição, removendo o resumo obrigatório. Links anteriores continuam válidos. Repost continua separado.
- Reaproveitar os históricos atuais em largura útil; manter diferenças de dados explícitas. A lista/tabela comum, drawer, filtros gerais e inspetor à esquerda são etapas seguintes.

## Contratos e arquitetura verificados

- V1: `/flows/:id`, `/flows/:id/quick-update`, `/flows/:id/canvas`, `/flows/:id/status`, `/flows/:id/executions[/:executionId]`. O rápido reconstrói grafo linear; o construtor tem nós/arestas arbitrários. Portanto, a proteção de compatibilidade e rascunho entra junto da navegação, não numa fase final.
- V2: `/flows-v2/:id` e `/status` com revisão esperada, histórico `/executions`. O estado de `SharedFlowCreator` já é compartilhado entre rápido/canvas. Preservar `simpleValues(...).compatible` e o grafo completo.
- Histórico V1 é paginado; V2 atual retorna um recorte com entregas. Não apresentar contadores como totais globais nem fabricar timeline/payload indisponível. A integração dos dois históricos requer adaptação própria, incluindo conferência de escopo por perfil.
- Cabeçalho, navegação, feedback e ação de salvar serão componentes compartilhados. Nenhuma nova API, credencial ou requisição de envio real.

## Mitigações da revisão do plano

- No Instagram V1, sem ID válido, Construtor e Histórico permanecem indisponíveis; trocar abas nunca prepara um registro. Facebook V2 mantém o canvas em memória antes de salvar; somente o Histórico exige ID.
- No construtor V1, o estado local ainda não aplicado do painel do nó também bloqueia a troca. Consultar Histórico conserva esse painel.
- Nome e canvas são enviados juntos com `expectedUpdatedAt`; a troca só é liberada depois da revalidação confirmada.

## Verificação

Backup temporário das views antes desta rodada. TDD para cabeçalho único, troca de modos/URL, rascunho preservado no histórico, bloqueio de troca V1 com alterações/grafo incompatível, callbacks de salvar/status e estados de carregamento/falha. Regressão da suíte Meta, TypeScript e build frontend. Revisões de plano/código/docs/aceitação e validação no navegador local sem salvar/ativar regras reais; qualquer prova real continua restrita ao Escorpiano.

## Resultado desta rodada

- Backup temporário local das views criado antes da alteração, fora do versionamento.
- Barra e três modos aplicados aos editores Instagram V1 e Facebook/Messenger V2. Resumo obrigatório V1 removido da entrada; repost e credenciais preservados.
- Guardas de rascunho incluem nome, grafo e configuração de nó ainda não aplicada. Atualização remota incompatível bloqueia gravação rápida, sem substituir o tipo nem apagar edição local. Troca limpa revalida antes de confirmar o modo; inputs ficam bloqueados durante a consulta.
- O canvas V1 diferencia PUT aceito de versão confirmada. Se a consulta falhar, Salvar repete apenas a confirmação antes de permitir nova escrita.
- 241 testes de componentes/contratos em 33 arquivos aprovados; TypeScript frontend e build de produção aprovados. `git diff --check` sem problemas; 11 chaves de workspace presentes em pt/en.
- Revisões de plano, código, documentação e aceitação concluídas. Nenhuma alteração em CLAUDE/AGENTS ou contrato backend/API/MCP.
- Chrome local no Escorpiano: rápido, canvas e histórico nas duas redes; guarda de edição V1 e rascunho no histórico; retorno do canvas ao rápido V2. Rolagem do formulário manteve documento em zero e barra no topo; escala da prévia ajustada ao espaço disponível. Sem salvar, ativar/pausar ou enviar mensagens reais. Nenhuma nova imagem Docker.
- Capturas locais em `output/automation-workspace/`, fora do versionamento. Próxima fase: apresentação comum de histórico e revisão do inspetor, sem prometer consolidação dos motores nesta entrega.

## Revisão final antes da consolidação

A guarda V1 deve manter no construtor os Stories que combinam palavras-chave com `matchReactions=true` ou omitido (padrão true no motor). O editor rápido representa palavras-chave com `matchReactions=false`; abrir/salvar essa combinação mudaria o gatilho. Acrescentar regressões para verdadeiro/omitido recusados e falso aceito, sem alterar o executor nem inventar um novo controle no formulário. Stories sem palavras-chave e regras rápidas já representáveis continuam disponíveis.
