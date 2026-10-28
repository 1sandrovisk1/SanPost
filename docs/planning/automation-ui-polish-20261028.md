# Refinamento dos editores e histórico

## Escopo aprovado pelo pedido

Mover o inspetor dos nós para a esquerda no construtor visual Instagram e Facebook/Messenger; manter a estrutura das três abas e os contratos de execução/salvamento. Aproveitar a análise de UX para retirar redundâncias, corrigir a prévia da publicação e simplificar o histórico, sem reduzir precisão ou esconder problemas operacionais.

## Implementação

1. Inspetor à esquerda em coluna própria, canvas com largura restante e scroll independente; adaptar coordenadas de drop à viewport real. No Instagram, preservar a aplicação local explícita do nó: renomear o botão para **Aplicar ao nó**, informando que a gravação ocorre no Salvar global. Não eliminar o guard de alterações locais sem substituir seu contrato. Facebook já atualiza o rascunho compartilhado diretamente.
2. Remover a frase de automação ativa e o gatilho duplicado no formulário. Manter rascunho, erros, pendências e consequências de salvar visíveis. Compactar o status positivo do webhook sem afirmar verificação de token que não foi feita.
3. Prévia deve usar a publicação realmente selecionada: catálogo carregado (incluindo mais páginas) ou agendamento selecionado via consulta existente. Reutilizar uma projeção/consulta somente leitura; não mudar associação por ID. Seleção múltipla permite alternar a publicação ilustrada; sem mídia disponível mostrar estado correto, nunca pedir selecionar quando já selecionada. Aumentar discretamente a legibilidade do telefone.
4. Ajuda secundária com disclosure nativo acessível por clique/teclado/toque; entrega direta, prévia e regras de palavras-chave. Variáveis suportadas no Instagram com inserção no cursor, preservando texto e foco. Não exibir variáveis não implementadas pelo motor V2.
5. Histórico: remover subtítulo, atualização automática junto ao cabeçalho e paginação só quando necessária; sem inventar total a partir da página. Fuso compacto traduzido dinamicamente, IANA disponível na ajuda. Drawer compacto: mensagem sem label repetido, explicação de aceite sob demanda somente quando houver aceite, status específico para prioridade quando comprovado. Preservar limitação V1 e resultado desconhecido. Detalhes técnicos continuam recolhidos. A espera de postback pertence ao mesmo nó TRIGGER no log real; não inventar uma etapa nova ou atribuição de entrega.

## Limites e verificação

Sem migração, chamada Meta, envio real, alteração de regras de roteamento, API pública ou MCP. Backup em `.secrets/ui-polish-20261028/views-before.tgz`; não versionar. TDD para seleção/prévia, aplicação local e histórico; suíte UI existente, TypeScript/build frontend, revisão de código e documentação. Navegador somente leitura no Escorpiano: conferir os dois construtores, painel esquerdo, scroll, histórico/drawer e prévia de agendamento. Desenvolvimento com fontes montadas, sem gerar imagem Docker.


## Resultado e validação

- Implementados os dois inspetores à esquerda, aplicação local explícita V1, prévia vinculada à seleção, mídia indisponível/vídeo, menu de variáveis V1, ajuda contextual e histórico compacto. A ajuda usa disclosure no fluxo normal: quando expandida, pode rolar no formulário sem recorte por um overlay.
- Suíte UI: 258 testes passaram em 36 arquivos; após os últimos refinamentos, 16 testes focados passaram e a conferência final de ajuda/prévia/histórico/inspetor passou com 13 testes (inclui um caso adicional de disclosure e alternância da ilustração). TypeScript e build frontend passaram; `git diff --check` limpo. Não houve alteração no backend nesta rodada.
- Revisores de plano, código, documentação e aceitação sem bloqueios. A revisão identificou recorte horizontal da ajuda, corrigido antes da conferência; a conferência também levou à expansão no fluxo normal para evitar recorte vertical.

### Browser Validation

Chrome no ambiente local do perfil Escorpiano, sem salvar, ativar, pausar ou enviar mensagens. Confirmados inspetores Instagram/Facebook à esquerda, Salvar indisponível sem alterações, Aplicar ao nó distinguido de Salvar global, navegação entre modos, publicação do agendamento na prévia de ambas as redes, ajuda expansível e rolagem independente, histórico sem subtítulo/paginação desnecessária e drawer com mensagens compactas. Inspecionado o acesso ao painel em viewport 390×844; override restaurado. Sem erros/avisos de console nas abas conferidas.

Capturas locais em `output/automation-ui-polish/` (não versionar). Backup em `.secrets/ui-polish-20261028/views-before.tgz`. Frontend atualizado por fontes montadas; nenhuma nova imagem Docker, reinício do backend ou alteração de configuração externa.
