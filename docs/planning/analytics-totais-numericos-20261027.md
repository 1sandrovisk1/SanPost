# Correção dos totais e gráficos de métricas

## Diagnóstico

A foto do domínio de produção mostra totais desproporcionais e a mesma variação +5% nos cards. No código atual, o contrato de analytics permite totais serializados como string (Facebook retorna `String`), mas `RenderAnalytics` e o agrupamento do `ChartSocial` fazem `acc + curr.total`, concatenando dias. Uma sequência 12, 34, 5 pode virar 12.345 em vez de 51. O gráfico também é montado em efeito sem dependências e pode conservar dados de outro período. Cinco providers declaram `percentageChange: 5` sem comparação real.

## Contrato da correção

- Preservar endpoints, escopo, período e formatos de resposta existentes. Normalizar strings/números finitos para números na fronteira da UI, compartilhando os valores entre total e gráfico. Recusar payload inválido explicitamente, sem convertê-lo em zero.
- Tratar série vazia como valor indisponível; médias não dividem por zero e agrupamento de médias usa média. Validar overflow da soma.
- Atualizar o gráfico quando os dados, modo ou cor mudarem. Cobrir também o consumidor de estatísticas da publicação e conservar `{missing:true}`.
- Aguardar JSON antes de terminar carregamento. HTTP/JSON inválido oferece erro e nova tentativa, não reconexão OAuth. Ausência legítima de dados oferece atualização da consulta.
- Variação percentual passa a opcional no contrato. Retirar somente +5% fabricados de Facebook, Instagram, LinkedIn Page, Threads e X; não inventar comparação entre períodos.
- Namespace do cache de métricas de conta passa a `integration:analytics-v2:<org>:<integration>:<period>`, para não reutilizar o percentual fixo de uma resposta anterior. Guardas de perfil e identificação por conta/período são preservadas; sem apagar Redis global ou dados de negócio.
- Evitar corte de números longos dentro do card, sem redesenhar a tela. Textos novos em pt-BR/en.

## Validação

TDD com strings numéricas, números mistos, zero, decimais, médias, vazio, inválidos, overflow, agrupamento e rerender. Testes de UI com fetch/SWR e Chart.js simulados, sem Meta ou dados reais. Regressão de providers/analytics, compilação e conferência local. Atualização pelo fluxo `pnpm dev:local`, sem imagem nova. A correção local não significa implantação no domínio de produção mostrado na foto.

## Resultado

- RED reproduziu a concatenação no card e no agrupamento, gráfico desatualizado, falhas sem feedback e entrada crua de strings nas estatísticas da publicação. Testes separados também falharam para o +5% fixo do Facebook e para reutilização do namespace antigo de cache.
- 21 testes de frontend passaram em quatro arquivos: helper numérico, card de conta, estatísticas de publicação e Chart.js. Casos incluem troca de conta/período, espera pelo JSON, erro HTTP com retry sem OAuth, preservação de `missing`, valores inválidos e overflow.
- 84 testes passaram em sete suítes backend: cinco providers, transporte protegido de analytics e IntegrationService. Não houve requisição real à Meta nem alteração de dados/credenciais de conta.
- TypeScript do frontend passou (`tsc --noEmit --incremental false`); backend e worker compilaram com `pnpm dev:local`. Contêiner saudável com a mesma imagem Docker anterior; `git diff --check` passou.
- Revisão funcional sem blocker. Doc-maintainer propôs somente adições opcionais de mapa/pitfall nas instruções, sem editar CLAUDE/AGENTS.
- A correção está aplicada somente no ambiente local. O domínio `media.automacaosemlimites.com.br` da foto não recebeu implantação nesta rodada; é necessário incluir esta correção na próxima entrega de produção.
