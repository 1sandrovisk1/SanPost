# Seleção combinada de publicações e Dark Posts

## Decisão de UX

Manter três modos: publicações específicas, qualquer publicação e próxima publicação. Dark Post é um tipo/origem de publicação, não um quarto modo exclusivo: uma mesma automação deve poder selecionar posts normais e vários anúncios juntos. A localização por ID/link ficará dentro do card de publicações específicas. Nenhuma mudança no motor, no grafo, em `postMode` ou no contrato de escrita.

## Ajustes previstos

- Resolvedor expõe `isPublished?: boolean`, somente quando `is_published` é booleano na Meta, na prévia existente. Sem inferência pela ausência em `published_posts` e sem campo novo na regra. Campo opcional/aditivo em REST/MCP e painel.
- Badge **Dark Post** somente se `isPublished === false`; metadados recuperados por ID sem essa confirmação recebem **Por ID**. Posts normais não recebem badge “Publicado”. Proveniência “Por ID” é apenas da recuperação atual, não uma classificação persistida da regra ou prova de anúncio pago.
- Conservar em memória os metadados recuperados para não perder miniaturas ao alternar modos. Resultados com falha não geram retries automáticos; a lista de referências do hook continua derivada do catálogo publicado, independente dos metadados recuperados, evitando loop.
- Ao alternar para qualquer/próxima, payload continua limpando `postIds`/agendamento conforme contrato. Ao voltar para específicas na mesma sessão/conta, restaurar a última seleção explícita (incluindo agendamento exclusivo, se era o caso). Não salvar IDs ocultos em outro modo, não restaurar seleção de outra conta/perfil/usuário e não sobrescrever regra remota ao apenas carregar metadados. Snapshot temporário não sobrevive ao recarregamento quando outro modo foi salvo.
- Lookup permanece expansível e pode misturar IDs com publicações da galeria; fica dentro do card, com ajuda curta. Preview e modal exibem a mesma badge. Respeitar somente leitura, limites, publicações agendadas e IDs canônicos.

## Verificação e aplicação

Backup privado de fontes antes das edições. TDD: seleção mista, alternar all/next/specific sem perder IDs/miniaturas, sem IDs inativos no payload, isolamento de conta e seleção vazia deliberada; badge false/true/ausente/valor inválido e agendado/publicado; lookup dentro do card; recarga e falha parcial sem loop. Regressão UI completa e testes do resolvedor/API, TypeScript/builds pertinentes. Revisões de plano/código/segurança/documentação/aceitação. Navegador sem gravação no servidor, somente no Escorpiano: alternar temporariamente o formulário e restaurar a seleção, sem Salvar/ativar/pausar; conferir revisão/configuração inalteradas pela API. Sem novos envios/comentários/campanhas reais nessa rodada.


## Entrega e validação

Revisões de plano, código, segurança, documentação e aceitação sem bloqueadores. TDD reproduziu a perda ao alternar e a ausência das badges antes da implementação. Resultado: **301 testes de UI em 38 arquivos**, **119 testes backend/API em cinco suítes**, TypeScript frontend, build TypeScript isolado do backend e build de produção frontend passaram. Sem migração/schema novo; runtime atualizado com os dois módulos compilados da projeção, imports relativos verificados e backup anterior privado. Container saudável.

REST e MCP confirmaram `isPublished=false` no Page Post do Escorpiano `271852286004401_122322703694221279`. Navegador: badge Dark Post, lookup dentro do card, alternância specific → all → next → specific com miniatura preservada; seleção mista com um post normal, troca para all e retorno manteve os dois selecionados. A seleção original foi restaurada no formulário e uma nova aba limpa confirmou a versão salva, sem mudanças pendentes. Console dessa aba sem erros/avisos capturados. API antes/depois confirmou nome, revisão 3, ACTIVE, configuração e grafo inalterados. Nenhum envio real, Salvar ou alteração de status nessa rodada. Screenshot local: `output/facebook-publication-selection-20261028.png`.
