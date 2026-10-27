# Variações de resposta pública no Facebook

Data: 26/10/2026. Incremento autorizado após a separação inicial das redes. Estado: implementado e disponível no ambiente local de desenvolvimento, sem nova imagem Docker.

## Contrato e comportamento

- Reutilizar `REPLY_COMMENT` no contrato autenticado `/flows-v2`: `message` conserva a resposta única; `messages` contém de uma a dez alternativas não vazias, com até 2.200 caracteres cada. Se ambos existirem, `messages` tem precedência, como no motor anterior.
- Por comentário elegível e nó de resposta pública, escolher apenas uma alternativa. Não enviar todas nem prometer rodízio sem repetição: dois comentários podem receber o mesmo texto.
- Escolher na ingestão e gravar o texto renderizado em `FlowExecutionV2.snapshot.actions`, na transação de evento/execução/despacho existente. Entrega e retomadas usam esse snapshot. Redelivery do evento não cria outra execução nem sorteio persistido.
- Manter o contrato de respostas únicas e os snapshots já existentes; sem migração de banco ou alteração do Instagram V1. O motor V2 compartilhado usa o mesmo comportamento para seus fluxos antigos.
- Formulário e construtor visual devem permitir adicionar, editar e remover alternativas sem perda na troca de editor ou ao reabrir. A prévia identifica qual alternativa está mostrando; não representa o resultado de um sorteio real.
- Preservar isolamento por perfil, limites, pausas e reservas de envio. A resposta privada não muda.

## Validação realizada

RED/GREEN de seleção por nó, limites e interpolação, persistência do texto escolhido, evento duplicado, retomada sem novo envio, edição rápida/visual, reabertura, prévia e bloqueio de edição ativa. Configurações antigas com `message` e `messages` também são preservadas, independentemente da ordem das chaves.

- `pnpm test:automations:regression --coverage=false`: 576 testes aprovados; seis casos da suíte opt-in de PostgreSQL isolado não executados neste incremento.
- `pnpm exec vitest run --config tools/vitest.facebook-panel.config.mts`: 145 testes de interface aprovados. Após acrescentar o caso de compatibilidade de ordem das chaves e finalizar a prévia vazia, os 14 testes do criador passaram novamente (146 casos distintos de interface).
- TypeScript do frontend aprovado; backend e orchestrator compilados e aplicados por `pnpm dev:local`. Contêiner saudável, usando a mesma imagem.
- Navegador autenticado no perfil Escorpiano: três alternativas, escolha da segunda na prévia, troca para o construtor visual e retorno ao editor simples sem perda dos textos. Console sem erros/avisos capturados. Exemplo não salvo: nenhuma automação criada/ativada e nenhuma mensagem real enviada.
- Revisões de plano, código e documentação concluídas. A prévia retorna à mensagem privada quando a alternativa pública selecionada está vazia, evitando uma aba sem conteúdo.

Evidência visual local: `output/facebook-reply-variations-20261026/quick-editor.png`. A homologação de envio real com várias alternativas permanece separada desta validação automatizada e visual.
