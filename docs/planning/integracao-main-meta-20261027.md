# Integração das automações Meta e correções na main

## Escopo autorizado

Sincronizar a branch de implementação com a main, abrir PR no fork `maiconramos/robo-multipost` e mesclar após validar. Inclui os recursos Meta/Facebook/Messenger, interface de credenciais/ajuda, automações de posts agendados, API/MCP, isolamento por perfil e correção de métricas construídos nesta conversa. Não inclui promoção de release, tag ou deploy de produção.

## Preservação e revisão

- Snapshot privado do diff e arquivos não rastreados criado em `.secrets/pr-main-sync-20261027/`, sem incluir esse diretório na entrega.
- Capturas de navegador/imagens e índices Graphify gerados permanecem locais. Ferramentas, configurações de testes e dependências dos comandos publicados acompanham o PR, sem credenciais ou corpos reais de webhook.
- A main avançou 18 commits até `e403cf1a`, com correções de segurança, providers e dependências. Preservar coerção de settings por DTO, contagem de caracteres/bytes, projeções seguras, escopo por perfil, SSRF e CAS de resolução de release.
- Combinar congelamento de targets agendados com retorno público somente `{id}` na atualização de release. Não reintroduzir retorno de Post/Integration completos.
- Revisar efeitos em regras legadas já ativas e desalinhadas, não só em criação/ativação novas. Corrigir com testes qualquer admissão que atravesse perfis, sem transferir registros existentes.
- Validar com Node 22.23.4 e o lockfile atualizados; não presumir compatibilidade da imagem local anterior depois da atualização de dependências.

## Gates

Revisões de código, segurança e aceitação da feature; testes unitários, frontend e PostgreSQL/Redis isolados aplicáveis; builds e schema validados; diff sem arquivos privados; CI do PR concluída antes do merge. O PR deve descrever escopo final, migrações e limitações comprovadas, sem declarar suporte a vídeo exclusivo de anúncio ainda não homologado ou deploy que não ocorreu.

## Integração aplicada

- Commit de feature `9d0de9ac`; merge da main `e403cf1a` em `160da440`. Conflitos de traduções preservaram todas as chaves das duas origens; 600 chaves novas existem nos dois idiomas. Conflitos do scheduler e changelog foram combinados sem remover as correções da main.
- Scheduler MCP e edição de posts usam coerção por DTO com suporte a JSON, preservando IDs acima de `2^53`; Threads conta bytes UTF-8. `updatePost` continua interno/completo; `updateReleaseId` retorna somente `{id}` também na transação que congela o alvo agendado.
- Revisões de plano, código, segurança, documentação e aceitação macro executadas. A revisão macro não identificou lacuna adicional; vídeo exclusivo de anúncio continua pendente de prova real.

## Fechamento dos achados de segurança

- Leituras do worker, próxima publicação, admissão transacional legada e PendingPostback conferem organização e perfil atuais. Conta legada sem perfil é compatível somente na própria organização; conta atribuída não autoriza Flow sem perfil. Regras não são movidas ou reativadas.
- O PendingPostback precisa pertencer ao Flow e à integração; clique externo confere também `igSenderId` e o ID remoto da conta, antes da deduplicação. Os textos congelados no snapshot não são substituídos pelas mensagens atuais.
- O guard HTTP aplica os limites declarados às mutações e leituras remotas das famílias autenticadas de automações e gerenciamento. Rotas privadas usam 60 requisições/minuto por organização e handler. Barra final e variações de caixa não evitam o limite. Leituras locais e webhooks Meta permanecem fora desta política; MCP usa transporte próprio, sem alegação de cobertura por esse guard.
- Logs de payloads de comentários/Stories/postbacks e falhas de assinatura foram substituídos por metadados mínimos. Testes usam somente fixtures sem tokens reais.

## Validações locais

- Node 22.23.4; instalação congelada do lockfile e geração Prisma concluídas.
- Build completo frontend/backend/orchestrator aprovado após a sincronização.
- Vitest: 183 testes Meta/editor, 21 métricas e 2 guia visual aprovados.
- PostgreSQL isolado: 33 testes em três suítes aprovados, sem tocar regras reais. Executados no runtime Linux existente, com o schema atual; dependências atualizadas e compilação também verificadas no host com o lockfile novo.
- Testes direcionados de compatibilidade e segurança: primeira rodada 234 aprovados. Suíte completa com cobertura, worker e regressões finais em execução; registrar resultado antes do merge.
- Não houve novo envio, anúncio, agendamento, atualização de autorização, deploy ou tag de produção. O lockfile atualizado requer dependências compatíveis no próximo start local; a imagem antiga não é tratada como atualizada.
