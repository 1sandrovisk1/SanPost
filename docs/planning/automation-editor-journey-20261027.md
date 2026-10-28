# Jornada visual no editor rápido de automações

## Escopo

Aplicar a revisão UX/UI preservando formulário à esquerda, telefone à direita, componentes e identidade existentes. Backup temporário das views/i18n em `.secrets/ui-editor-journey-20261027/views-before.tgz`; não publicar esse arquivo. Credenciais e regras reais não serão alteradas para validar.

## Decisões baseadas no funcionamento

- Resposta pública é ação e fica em **Resposta**, depois das condições e antes da mensagem privada, nas duas redes.
- Comentários sem filtro têm opção **Qualquer comentário**. Messenger continua exigindo palavras-chave; não oferecer “qualquer mensagem” sem suporte. Stories preservam palavras/reações conforme o gatilho.
- O motor Instagram de comentários oferece abertura com botão somente junto de `requireFollow`; o workflow cria PendingPostback e retoma para verificar seguidores. Stories verificam diretamente; Facebook V2 não possui essa jornada. Esta entrega representa essas capacidades atuais. Abertura independente do follow-gate precisa de evolução própria do motor/API/MCP e validação real; não habilitar campo que pareça executá-la.
- O gate de comentários Instagram terá três grupos expansíveis (abertura, verificação, tentativas), resumos e prévia das etapas existentes. A prévia de entrega direta não inventa mensagens/continuações não configuradas. Link para site e botão de resposta têm representação distinta.
- Foco/edição leva a prévia à etapa correspondente; navegação manual continua disponível. Variações aparecem no seletor de prévia somente em Comentários. Campos e alternância de preview não salvam nem enviam nada.
- Instagram mantém conta imutável após criar. Facebook permite mudar a Página no contrato existente, limpando a origem incompatível e informando o efeito. Não impor uma regra de backend diferente só para igualar os seletores.
- Rodapé compartilhado, progresso com texto, pendências e aviso de impacto junto de salvar. Usar endpoints atuais de salvar/status; não mudar políticas de execução. Ativar regra com alterações salva primeiro; falha posterior preserva ID/revisão e o rascunho, sem nova criação em retry. Sem contagem inventada nem confirmação obrigatória quando o contrato não informa pendências reais.

## Implementação planejada

1. Componentes locais compartilhados de respostas/grupos expansíveis, controles de prévia/jornada e rodapé. Tokens atuais, primitives existentes, i18n pt/en e acessibilidade por teclado.
2. Atualizar comentários Instagram e Facebook/Messenger, incluindo escolha correta de labels por gatilho e foco da DM/botão/variação.
3. Reutilizar rodapé e prévia contextual no Story Instagram, preservando contrato, filtro de reações e gate sem abertura.
4. Tests-first: hierarquia, navegação manual/foco, mensagens ilustrativas fielmente derivadas dos campos, resumos/gate, dirty state, salvar/ativar/pausar, retry após falha parcial e isolamento dos canais. Regressão de agendados/aliases/links preservada.
5. Verificação frontend (Vitest/TypeScript/build), revisões de código/segurança/docs/aceitação e navegador no ambiente local. Nenhum teste com envio real; futuras provas reais continuam somente no Escorpiano.

## Referências verificadas

- `flow.execution.workflow.ts` condiciona a abertura de comentário a `requireFollow`; `follow-gate-resolve.workflow.ts` retoma pelo clique.
- `quickCreateFlow`/`quickUpdateFlow` já aceitam `activate=false`; update de PAUSED preserva PAUSED. Rotas `/flows/:id/status` e `/flows-v2/:id/status` existem; V2 exige revisão esperada.
- Consulta às páginas oficiais Meta de private replies em 27/10 retornou indisponibilidade/429. Não tratar o texto da LLM como comprovação adicional de capacidade nem alterar regras de janelas com essa base.

## Entrega e validação

- Implementação e guia de uso: [Editor rápido de automações](../operations/editor-rapido-automacoes.md). Revisões de plano, código, segurança, documentação e aceitação concluídas sem bloqueio pendente.
- **218 testes de interface, em 29 arquivos, aprovados** com `tools/vitest.facebook-panel.config.mts`. Inclui as regressões anteriores de credenciais Meta, publicação agendada, aliases, variações, editor visual e canais. Novos casos cobrem os controles de jornada, rodapé, salvar/ativar em falha parcial e revalidação limpa/dirty, inclusive ao desfazer a edição.
- **TypeScript do frontend aprovado** (`tsc --noEmit --incremental false --project apps/frontend/tsconfig.json`), com Node 22.23.4.
- **Build de produção do frontend aprovado** (`pnpm build:frontend`). Nenhuma imagem Docker foi construída; o ambiente local continua carregando os fontes.
- **40 novas chaves** com paridade pt/en e sem valor vazio. `git diff --check` aprovado. O repositório não define script `lint`; `pnpm lint` resolveu o executável externo homônimo do host e falhou por falta de Java. Esse resultado não é lint do código e não foi contabilizado como aprovação.
- Navegador no perfil **Escorpiano**: Facebook troca Comentários/DM ao focar variação/mensagem e não mostra salvar em regra ativa sem alterações; Instagram mostra três grupos compactos, seleção manual de caminho e volta ao estado limpo ao desfazer o toggle local. Messenger exibe a palavra-chave recebida antes da resposta, sem seletor de publicações ou resposta pública. Nenhuma ação de salvar, ativar, pausar ou envio real foi executada.
- Capturas locais em `output/editor-journey/`; backup temporário em `.secrets/ui-editor-journey-20261027/`. Não incluir esses artefatos nem as alterações preexistentes de `graphify-out/`/Docker no diff da feature.
- Trabalho na branch `codex/automation-editor-journey`, a partir da main `a67fa6ed`. Sem novo commit, PR ou merge solicitado para este ajuste.

## Fora deste incremento

Mensagem inicial independente do gate no Instagram e sua implementação no Facebook/Messenger precisam de uma evolução própria do motor e dos contratos API/MCP. Não há opção visual que prometa esse fluxo. Não foram adicionados coleta de e-mail, lembretes, novos gatilhos ou regras de janelas da Meta. A validação do vídeo exclusivo de anúncio não publicado continua adiada, como solicitado.

## Ajuste incremental solicitado após a revisão visual

- Remover os títulos e subtítulos redundantes dos editores rápidos, mantendo navegação de volta, nome e seções. Remover o aviso de conta fixa sem tornar a conta editável. Ocultar somente o status informativo `published` do agendado: falhas/cancelamentos/indisponibilidade continuam visíveis e o vínculo não muda.
- Mover ativação/pausa para um único switch acessível no topo direito da prévia. No modo visual/histórico V2 sem prévia, o mesmo controle fica no cabeçalho. O rodapé terá exclusivamente salvar, com pendências, progresso e erros existentes.
- O switch usa as mesmas funções de status: ativar um formulário alterado salva antes, pausando não salva/descarta alterações; falhas preservam ID/revisão e estado confirmado. Estado ativo vem da resposta do servidor, sem sucesso otimista. Desabilitar enquanto ocupado/arquivado; validação bloqueia ativar, mas não pausar.
- Corrigir a área rolável no desktop, preservando layout responsivo e o alcance do formulário e das ações. Reproduzir/medir rolagem externa e validar que cabeçalho, switch e rodapé não desaparecem; não aplicar bloqueio de scroll em outras páginas nem impedir galerias/modais.
- Testes primeiro para rodapé sem ativar/pausar, switch/validação/progresso/erro e integração dos três editores; remoção apenas do texto publicado. Validar no navegador sem acionar o switch de automações reais. Backup incremental em `.secrets/ui-editor-controls-20261027/views-before.tgz`.

### Resultado da rodada incremental

- **228 testes aprovados, em 30 arquivos**, incluindo as regressões anteriores de Meta/Instagram/Facebook/Messenger, testes do switch e falha de status no histórico. TypeScript e `pnpm build:frontend` aprovados; `git diff --check` sem erros. Nenhuma imagem Docker nova.
- Reproduzido o defeito desktop: rolar fora do formulário movia a página externa para `scrollTop=404`, colocando o editor em `top=-311`. Após a correção, rolar a prévia mantém `scrollTop=0`, editor em `top=93`; o formulário rola internamente e o rodapé permanece dentro da viewport.
- Galeria abriu e fechou por Escape sem mudar a seleção; retângulo dentro da viewport e rolagem externa em zero. No Instagram, confirmados remoção de títulos/avisos, seletor da conta ainda bloqueado e toggle único dentro da prévia. Capturas em `output/editor-controls/`.
- As rotas Instagram de criação e edição restringem altura/overflow ao desktop, deixando mobile em fluxo natural. Não houve emulação de viewport mobile nesta rodada; a ferramenta de navegador não expõe esse recurso.
- Nenhum switch real foi acionado, nem botão de salvar/ativar/pausar ou envio real. Estado e configurações das regras do Escorpiano preservados.
