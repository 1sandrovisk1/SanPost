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
