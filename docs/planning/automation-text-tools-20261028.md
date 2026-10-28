# Campos de resposta e ferramentas de texto

## Escopo e decisões

Remover o contorno/fundo cinza do toggle público: o grupo verde já delimita a resposta e suas variações. Reutilizar esse switch sem box também em Pedir para seguir, mantendo os subgrupos expansíveis existentes e os mesmos valores. Mensagens privadas com mais de uma alternativa ganham um box por alternativa com texto e CTA correspondentes. Ajuda do link fica à direita da linha do botão, por alternativa, sem ajuda isolada no fim da seção.

A ferramenta de texto substitui Inserir variável/select por uma barra discreta visível ao focar o campo (emoji, variáveis quando suportadas e contador). Inserção deve substituir a seleção atual, conservar o restante, restaurar foco/cursor, respeitar maxLength sem cortar emoji/token e não gravar. Menus por portal, limitados ao viewport, com clique fora/Escape e acesso por teclado. Popover permanece aberto ao focar sua busca/controles e não altera o scroll do formulário.

Reutilizar emoji-picker-react já instalado e usado no composer, com emoji nativo (sem download de imagens), rótulos/categorias localizados e prévia de nomes desativada. Nenhuma biblioteca nova. Variáveis preservam os formatos/capacidades V1 e V2; Messenger só texto e ID da mensagem. Respostas públicas e DMs têm tokens conforme seu motor; gate/abertura/falha recebem só emoji, pois o backend não interpola esses textos. Sem alterar APIs, templates ou execução.

Aplicar aos componentes compartilhados de mensagens públicas/privadas e textos do gate, tanto rápido quanto inspetores V1/V2. Campos de configuração (IDs, palavras-chave, URLs) não ganham ferramentas de mensagem. Remover boxes redundantes só no rápido, preservando subetapas.

## Verificação

Backup privado das views; TDD RED antes da produção: toggle simples, switch de seguidores, boxes dos pares, posição da ajuda, foco/seleção, inserção de emoji e variável, isolamento de alternativa, limites, Escape/clique fora e tokens por motor. Rever regras de hooks/i18n e elementos interativos aninhados; manter atalhos de preenchimento/preview e estado de edição. Docs/CHANGELOG pt-BR. Tipagem/build/testes e navegador local Escorpiano em rascunho não salvo, sem envios ou ativação.

## Resultado verificado

- Backup privado das views feito antes da edição; nenhuma credencial ou artefato de teste entrou no Git.
- RED antes da implementação dos controles e da barra. Regressões adicionais reproduziram o foco prematuro da busca de emojis e a perda do limite de tentativas no inspetor V1; ambas corrigidas antes do GREEN.
- 338 testes Vitest em 46 arquivos, `tsc --noEmit` e build de produção Next aprovados. Nenhum contrato de backend foi alterado nesta rodada.
- Revisões de plano, código, documentação e aceitação sem bloqueadores após correções. Nenhuma alteração necessária em CLAUDE/AGENTS.
- Chrome local, perfil Escorpiano: boxes de alternativas, ajuda na linha do CTA, variável/emoji inseridos no cursor com retorno do foco, busca de emojis aberta ao digitar, switch de seguidores e subetapas com emojis sem variáveis. Edição temporária descartada ao recarregar; Salvar desabilitado e valores originais restaurados, sem gravação ou envio real.
- Console: único aviso observado foi divergência de hidratação pelos atributos `data-tag-assistant` injetados no HTML pela extensão. Nenhum erro nos componentes desta rodada.
