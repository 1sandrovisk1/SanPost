# Automações em posts agendados no MultiPost

Data: 27/10/2026. Implementação autorizada pelo usuário. Facebook e Instagram continuam com automações separadas.

## Contrato

Adicionar `postMode: "scheduled"` e `scheduledPostId` (ID interno de um destino `Post.id`, retornado ao agendar). Os IDs remotos continuam exclusivamente em `postIds` para o modo `specific`. Um agendamento por canal/automação; 30 posts podem ter 30 regras independentes, sem depender da ordem de publicação. Comentários de Feed/Reels apenas; Messenger e Stories não aceitam esse modo.

- Instagram: criação/edição rápida e `POST/PUT /public/v1/flows`, com o contrato aditivo acima; MCP existente aceita a referência interna.
- Facebook: criação/edição V2 recebe os campos em `channels[]`; API pública V2 aditiva e ferramenta MCP para o mesmo contrato de comentário, sem converter a automação para Instagram.
- Consulta paginada de agendamentos por integração, no escopo autenticado, com legenda, data e estado. O painel mostra também o destino já selecionado quando ele sai da fila.

## Persistência e execução

Alvo persistente por automação/integração referencia `Post.id`, nunca `group`. Validar organização, perfil, integração, post raiz, fila, ausência de publicação anterior e tipo Feed/Reel. Reagendar preserva o ID. Duplicar não replica a associação. Recorrência é recusada explicitamente nesta primeira versão porque requer seleção de ocorrência; não reutilizar silenciosamente a publicação anterior.

Os motores normais nunca tratam `scheduled` como todos/próxima publicação. Comentários verificados são capturados em fila própria somente para alvos ativos, com geração do alvo e versão/data da automação. Reconciliação durável espera o resultado publicado no banco, valida novamente a propriedade e congela os IDs remotos comprovados. Isso cobre comentário antecipado, reinício e correção por `updateReleaseId`, sem republicar. Facebook vídeo exige comprovar a relação vídeo/post; não concatenar ID do vídeo com ID da Página por suposição.

Despacho restrito ao alvo capturado, com deduplicação e workflow estável. Alterar/pausar/excluir a regra invalida eventos anteriores. Não reprocessar eventos antigos contra novas regras. Post removido, convertido em rascunho, com falha ou conta alterada fica identificado na interface; nunca amplia o escopo.

## Validação

TDD de isolamento/validação, 30 alvos e ordem invertida, erro/cancelamento/reagendamento/duplicação/recorrência, captura antes do resultado, correção de releaseId, concorrência/reinício/deduplicação e preservação dos modos anteriores. Testar contratos REST/MCP, formulário/construtor e reabertura da seleção. Validar no navegador em desenvolvimento; testes reais apenas no Escorpiano, sem publicar automaticamente para obter uma prova.

Backup anterior: `.secrets/view-backups/20261027-scheduled-automations/before.tar.gz`. Migração aditiva; sem reescrever regras existentes.


## Implementação e resultados

Implementados: referência interna por destino, seletor compartilhado nos editores Instagram/Facebook e construtor Instagram; contratos privados, API pública V2 e extensão MCP; captura própria e replay restrito aos motores; congelamento da primeira publicação na transação do resultado/correção; bloqueio do Post durante criação do alvo; deduplicação de captura no banco; guarda de geração no workflow legado; limpeza no boot e horária. Canvas legado comum, incluindo perfil nulo, preserva o caminho anterior. Regras existentes não foram convertidas.

- 709 testes da regressão de automações aprovados; 20 casos condicionados ao ambiente ignorados pelo comando.
- 170 testes da interface aprovados e TypeScript frontend sem erros.
- 163 casos focais e 26 casos adicionais de MCP/limpeza/repositório aprovados (há sobreposição com a regressão).
- 2 casos adicionais de persistência do resultado da publicação aprovados, garantindo transação única com o alvo e preservação da primeira publicação; a execução também repetiu 5 casos do repositório de agendamentos.
- 20 testes PostgreSQL isolados aprovados, incluindo 30 destinos invertidos, evento antes do resultado, concorrência/deduplicação, rollback, isolamento, criação de alvo concorrente à publicação e correção de `missing`. O runner cria e remove somente um banco com prefixo `multipost_shared_test_`; não usa o banco do perfil para fixtures.
- Navegador no Escorpiano: seletores Facebook e Instagram, conexões e estado vazio sem agendamentos elegíveis, sem erros/avisos de console. Não foram usados Salvar/Ativar nem publicados posts reais neste incremento. Capturas em `output/scheduled-automations/`.
- DDL aditiva aplicada apenas ao banco local recuperado; builds backend/worker e start em desenvolvimento concluídos com a mesma imagem Docker.

Atualização após a entrega: o usuário confirmou que agendou e criou as regras antes da publicação e, após publicar/comentar, recebeu DM no Instagram e mensagem no Messenger. A confirmação manual refere-se ao Escorpiano; nenhuma nova mensagem foi enviada pelo agente na revisão visual subsequente.

Plan-reviewer e revisão de código/segurança concluídos, com correções dos achados. Doc-maintainer propôs atualizações dos mapas CLAUDE; arquivos de instruções não foram alterados. A limpeza de capturas também foi registrada em StartupMigrationService, seguindo a convenção existente.
