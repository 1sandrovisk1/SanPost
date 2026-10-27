# Seletor de publicações e paridade visual

27/10/2026. Escopo autorizado: reunir publicados/agendados na seleção de publicações, miniaturas e tag Agendado; corrigir edição ativa e aproximar os componentes Facebook do Instagram aprovado.

O contrato continua exclusivo: IDs remotos em `specific`; um `Post.id` interno em `scheduled`. Escolher um agendado substitui a seleção de publicados, sem transformar IDs internos em IDs Meta. Não ampliar para qualquer publicação. Galeria e resumo comuns no Instagram/Facebook e construtor; miniatura de imagem ou vídeo usa os dados já salvos no agendamento.

Edição conserva a identidade do canal, o vínculo da próxima publicação e o histórico. Novas revisões invalidam eventos pendentes da configuração anterior. Salvamento ativo deve manter validação, isolamento, conflito de palavras-chave e transação. Próxima publicação não pode consumir uma publicação reservada por automação ativa de agendamento, nos binds explícitos ou preguiçosos.

A janela de confirmação dos IDs usa uma fila independente `DeferredNextAutomationEvent`, com snapshots somente das próximas regras existentes naquele evento. Ela não tem vínculo em cascata com a automação agendada: editar ou remover uma regra não apaga um comentário adiado de outra. Leases e deduplicação preservam reinício; revisão/data, conta e perfil são revalidados antes da retomada. Retenção igual à fila de agendados e limpeza no boot/horária já existentes. Migração puramente aditiva, sem converter regras ou eventos anteriores.

Reutilizar o modal de botão/link e a apresentação Instagram das condições e variações, preservando limites e capacidades de cada motor. Testes de comportamento antes das alterações; validar navegador em desenvolvimento sem nova imagem Docker. Testes reais somente Escorpiano.

Usuário confirmou entrega real após publicar os agendamentos, tanto no Instagram DM quanto no Messenger. Essa evidência é confirmação manual do usuário; não é novo envio executado nesta revisão.

## Resultado e validação

Implementado: galeria comum com miniaturas e etiqueta Agendado, sem opção de agendamento separada; componentes compartilhados para condições, botão/link e variações; edição ativa sem `PAUSE_BEFORE_EDIT`, preservando identidade, vínculo e histórico. Limites de cada canal continuam próprios. Uma automação seleciona publicações já publicadas ou um único agendamento; as regras Instagram e Facebook continuam separadas.

As reservas de agendamento são respeitadas pela próxima publicação, inclusive em concorrência e quando o ID de vídeo ainda precisa ser confirmado. Eventos adiados sobrevivem à remoção da outra regra; somente regras capturadas e ainda válidas podem retomá-los. IDs de vídeo sem prova de correspondência continuam em espera, conforme o procedimento operacional.

- 713 testes de regressão backend aprovados; duas suítes condicionadas ao ambiente permaneceram ignoradas (23 casos).
- 177 testes de interface aprovados; após os ajustes finais de tradução/atualização da galeria, 69 testes de automações reexecutados e aprovados. O último ajuste de espaçamento das legendas foi validado com os 14 testes do seletor e da integração Facebook.
- 25 testes PostgreSQL em banco descartável aprovados, incluindo concorrência, isolamento, preservação de vínculo, replay e proteção contra campos extras na entrada.
- TypeScript frontend, build backend/worker e `git diff --check` aprovados.
- Navegador: galerias Instagram e Facebook verificadas com as automações existentes do Escorpiano, incluindo a miniatura real, tag, datas pt-BR e ausência da duplicação do mesmo post já publicado. Nenhuma seleção foi salva, nenhum status alterado e nenhuma mensagem real enviada nesta revisão. Instagram aberto após a atualização sem avisos/erros de console; no Facebook, o registro antigo de erro transitório do Next durante reinício não reapareceu após recarregar.
- Prints: `output/scheduled-selector/facebook-galeria.png`, `instagram-galeria.png` e `facebook-editor.png`.

Backup temporário anterior às alterações em `.secrets/view-backups/20261027-scheduled-selector-081348/before.tar.gz`. Ambiente local atualizado pelo fluxo de desenvolvimento, reutilizando a imagem Docker existente; migração aditiva aplicada somente no banco local restaurado.

## Correção da etiqueta e da ordem das respostas

A etiqueta da miniatura deve aparecer somente enquanto aguarda: Agendado. Após publicar, a miniatura fica sem etiqueta, como os demais posts, conforme preferência final do usuário. Falha, cancelamento ou indisponibilidade também não podem continuar indicando Agendado. Isso é apresentação: não converter `postMode` nem perder `scheduledPostId`, aliases e associação ao salvar/reabrir.

No editor rápido Facebook, usar a mesma ordem do Instagram: condições de palavras-chave, resposta pública opcional e variações, depois mensagem privada e botão/link. Labels e exemplos comuns são compartilhados; exemplos sem variáveis evitam sugerir a sintaxe exclusiva do Instagram no Facebook. Mensagens de ajuda sobre limites e variáveis continuam fiéis ao motor, e Messenger mantém sua própria janela e não oferece resposta pública. Testar status em miniatura/modal, atualização sem mutação, ordem no DOM, persistência da resposta e ausência de opções de comentário no Messenger.

Implementado e validado em 27/10: 75 testes de interface de automações passaram (12 arquivos), TypeScript frontend e `git diff --check` sem erros. Regressões novas falharam antes da correção de etiqueta e ordem. Revisão de código sem bloqueadores. Ordem, labels e ajuda conferidas nos dois editores, sem salvar ou enviar mensagens; console sem erros/avisos nas novas abas. Os primeiros prints em `output/badge-order/facebook-publicado.png` e `facebook-ordem.png` registram a etapa anterior à preferência de remover também a etiqueta Publicado. Backup anterior em `.secrets/view-backups/20261027-badge-order-085447/before.tar.gz`. Atualização automática do frontend, sem imagem Docker nova ou alteração de backend/banco.

Preferência final aplicada e conferida no navegador: publicado sem etiqueta no resumo e na galeria, com seleção preservada. Nove testes do seletor passaram, incluindo atualização do status e manutenção do vínculo; revisão sem bloqueadores. Print atual: `output/badge-order/facebook-sem-etiqueta.png`.
