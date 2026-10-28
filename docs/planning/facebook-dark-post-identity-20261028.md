# Dark Post de vídeo: identidade e seleção persistente

## Incidente observado

Na automação do Escorpiano `3c65ded3-741a-436a-8d42-f8641e0506d1`, ACTIVE revisão 2, foi salvo `271852286004401_1651363283147505`. A Meta aceita essa referência de vídeo em consultas de metadados, mas o vídeo informa `post_id=122322703694221279`. O Page Post real `271852286004401_122322703694221279` tem `is_published=false` e é o alvo dos dois eventos persistidos pelo webhook em 28/10 às 09h40 e 09h41 (Brasília). Sem igualdade com o alvo salvo, não houve execução. Não é perda do webhook nem falha de envio já tentado.

O editor também recarrega somente `published_posts`. A prévia localizada por ID é transitória e não entra no catálogo; ao recarregar, a seleção persiste nos IDs, mas perde miniatura/prévia porque o Dark Post não aparece na galeria publicada.

## Contrato e plano de correção

Preservar os endpoints existentes: POST privado `resolve-post` e GET público `options?resource=resolve_post`, consumidos também pelo MCP. Retornar sempre o ID do Page Post comprovado, distinto do vídeo, sem aliases heurísticos nem mudanças no executor.

1. Para metadados de Reel/vídeo, consultar o objeto de vídeo pelo ID numérico validado e conferir `id`, `from.id` e `post_id`. Consultar então o Page Post relacionado e conferir novamente o ID exato e a Página. Falha de relação/autorizações é erro controlado; nunca assumir `Page_videoId` como ID canônico só porque a Meta o aceitou. Permalinks HTTPS Facebook `/reel/ID` podem ser normalizados a esse mesmo caminho comprovado, sem buscar URLs fornecidas pelo cliente.
2. Ativação não deve admitir referência não canônica no caminho de seleção específica; solicitar resolução correta em vez de salvar um alvo que não corresponde ao webhook. Não migrar regras antigas em massa.
3. Reidratar metadados dos IDs Facebook selecionados e ausentes da galeria usando o resolvedor existente. Hook SWR separado, cache por usuário/perfil/conta/IDs, fila limitada, sem atualização por foco nem retry infinito. Metadados nunca alteram seleção/IDs. Erro preserva os IDs e oferece nova consulta; resposta de outra conta/seleção não pode substituir a atual. Ao adicionar uma publicação localizada, conservar a prévia imediatamente no catálogo local.
4. Corrigir somente a automação do incidente pela API com snapshot de revisão, substituindo a referência errada pelo Page Post comprovado e preservando todas as respostas, modo e estado. Não reprocessar os dois comentários anteriores nem enviar manualmente. Solicitar um comentário novo após aplicar a correção e correlacionar webhook → execução → resposta, somente no Escorpiano.

## Verificação

TDD de referência/serviço para vídeo e Page Post distintos, vínculo `post_id` ausente/inválido, Página diferente, falha de permissão, preservação de Page Post comum e ausência de writes Meta. UI: adicionar, recarregar com catálogo sem Dark Post, manter miniatura/seleção/prévia; falha parcial, troca de conta/perfil e referência canônica diferente sem migração silenciosa. Testes de API/MCP existentes e validação da ativação preservados. Revisões de plano, código/segurança/docs e navegador antes de concluir. Backup temporário em `.secrets/dark-post-identity-20261028/sources-before.tgz`; sem nova imagem, campanha paga ou credenciais alteradas.

## Revisões e verificações de implementação

Plano, código, segurança e documentação revisados sem bloqueadores; orçamento de lookup preservado no endpoint, helper interno compartilhado com ativação. Recuperação automática limitada a cinco IDs, dois workers; lotes adicionais e retry somente explícitos. Testes: RED reproduziu 15 falhas do resolvedor/parser antes da correção; GREEN com 112 testes em cinco suítes backend/API e 289 testes em 38 arquivos UI, TypeScript frontend e builds backend/orchestrator/frontend passaram. Prova no navegador e comentário novo ainda pendentes.

Aplicação local: backup de fontes, runtimes compilados e dump PostgreSQL em `.secrets/dark-post-identity-20261028/`. O ambiente local ainda não tinha as duas colunas aditivas já presentes na main (`Integration.customName`, `OAuthAuthorization.profileId`); aplicados os dois SQLs idempotentes existentes, após dump, sem `db push`/perda de dados. Builds isolados preparados antes de parar o app; a aplicação inicial do build TypeScript isolado expôs aliases que o empacotamento Nest reescreve. O runtime anterior foi restaurado e somente os dois módulos compilados da correção (com imports relativos) foram substituídos juntos no backend e worker da imagem existente. A saúde voltou a `healthy`. Nenhuma alteração de campanha, permissões ou tokens.

## Resultado operacional aplicado

- Resolvedor REST consultado pelo ID de vídeo e pela URL do Reel retornou `271852286004401_122322703694221279`, com miniatura. MCP confirmou a mesma referência canônica.
- Automação do incidente atualizada via PUT com `expectedRevision=2`: revisão 3, ACTIVE, somente `postIds` alterado. Comparação da configuração confirmou nome, respostas e demais condições preservados. Snapshot antes/depois privado; sem replay dos dois comentários anteriores.
- Navegador: editor recarregado, Dark Post selecionado com miniatura recuperada, toggle ativo e Salvar desabilitado (sem mudanças). Console sem erro/aviso capturado. Evidência local em `output/dark-post-identity-20261028.png`.
- Solicitado comentário novo `DARKFIX28` no mesmo Reel para concluir webhook → execução → resposta. A automação é do usuário e permanece ativa; não se confunde com as regras temporárias antigas, que continuam pausadas.
