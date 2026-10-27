# Recuperação do ambiente local antigo — 20/10/2026

O usuário autorizou retomar o ambiente com os dados antigos. A recuperação usa uma **cópia** do banco; a origem e o banco vazio da homologação anterior permanecem preservados.

**Desenvolvimento atual (26/10/2026):** use `pnpm dev:local` para iniciar com atualização automática do frontend, sem novas imagens. O [guia de desenvolvimento](multipost-local-development.md) mantém todos os overlays abaixo e acrescenta os mounts dos fontes/servidores compilados. Comandos históricos sem esse overlay voltam ao código da imagem.

## Origem e destino

| Item | Origem preservada | Cópia para uso |
| --- | --- | --- |
| PostgreSQL | `postiz-postgres`, banco `postiz-db-local`, volume `robo-multipost_postgres-volume` | `multipost-facebook-local-postgres-1`, banco `multipost_restored_20261020` |
| Uploads locais | diretório `uploads/` deste repositório | volume `multipost-facebook-local_restored_uploads_20261020` |
| Criptografia | chaves do `.env` antigo | `.secrets/multipost-restored.env`, permissão `600`, não versionado |
| Acesso | antigo desenvolvimento local | mesmo túnel HTTPS descrito no [runbook Docker](multipost-local-docker.md) |

Os volumes antigos `robo-multipost_postiz-uploads` e `robo-multipost_postiz-config` estavam vazios. Os arquivos de mídia estavam no diretório `uploads/` do repositório movido; o `.env` antigo ainda apontava para o caminho anterior do checkout.

Dados encontrados: 6 usuários, 1 organização `asl`, 4 perfis não excluídos, 10 integrações não excluídas, 52 publicações não excluídas, 5 automações não excluídas e 86 registros de mídia. Entre os canais está a Página Facebook Alma Fitness. A presença dos registros não comprova validade atual dos tokens Meta.

## Backup e conferência

Backup privado: `.secrets/backups/legacy-local-20261020T095043Z/`. Contém dumps custom do banco antigo e da homologação anterior, cópias privadas dos arquivos de ambiente, backup dos uploads, schemas e manifestos de conferência/ajustes. O diretório é `700`; arquivos são `600`. Não versionar nem compartilhar esse conteúdo: há credenciais e dados das contas.

- `legacy-postiz.dump`: 398806 bytes; SHA-256 `02702495765e9da7bb753362b33d3f3208e136f41b023c879796c50a02db37e6`.
- `current-homologation.dump`: 255328 bytes; SHA-256 `6d166143354fdf16c440db3842eb3e4f5387f6e89f9aa1b609b8a01c0a2b95d5`.
- `legacy-uploads.tar.gz`: 40276829 bytes; SHA-256 `9d2bc34cb49d49e14317acd2362d94998e6235c35e0779a068b6b3225e59179f`.

Os dois dumps foram verificados com `pg_restore --list`. A restauração ocorreu em banco novo, com `--single-transaction --no-owner --no-acl --exit-on-error`, sem sobrescrever bancos existentes. Antes dos ajustes, as contagens de **todas as 88 tabelas** coincidiram com a origem. Os 13 arquivos de upload copiados também coincidiram por SHA-256.

O catálogo da cópia foi comparado com o banco inicializado pela imagem atual: colunas/tipos/defaults, conjuntos de valores dos enums, constraints e índices são equivalentes. As diferenças do dump são ordem física de colunas/enums adicionados historicamente. Nenhuma migração foi necessária. O overlay substitui `prisma db push` por `prisma validate`; mudanças futuras de schema exigem migração revisada, preservando as tabelas Mastra/vetoriais.

Seis credenciais de provider e quatro credenciais de IA foram decifradas com sucesso **offline**, usando a implementação de criptografia da imagem. Nenhum segredo foi impresso. O `.env` antigo tem `ENCRYPTION_KEY` vazio, portanto a chave deriva de `JWT_SECRET`; essa combinação foi preservada. O arquivo privado adicional usa `env_file.format: raw` para evitar interpolação das chaves. Senhas e usuários não foram redefinidos.

## Ajustes somente na cópia

`clone-adjustments.json` no backup privado guarda IDs, campos e valores anteriores/posteriores de cada ajuste:

- 4 flows `ACTIVE` passaram para `PAUSED`.
- 1 regra de repost habilitada foi desabilitada. Não havia AutoPost ativo.
- `tokenExpiration` de 10 integrações não excluídas ficou `NULL` para não disparar refresh/self-heal automático no primeiro boot. Restaurar datas/revalidar por canal ao retomar testes; tokens e credenciais foram mantidos.
- 12 URLs `Media.path`, 11 campos `Post.image` e 1 `Integration.picture` tiveram somente o prefixo local de uploads remapeado para o domínio HTTPS atual. O JSON dos posts foi interpretado; conteúdo/legendas/links de botões não foram substituídos globalmente.

Das 12 referências locais de mídia, 11 têm arquivo disponível. A referência sem arquivo pertence a um registro **já excluído** na origem; seu estado foi preservado. As 74 referências R2 permaneceram intactas, sem copiar credenciais de armazenamento remoto; novos uploads continuam no volume local isolado. A disponibilidade remota dessas 74 URLs não foi validada neste procedimento.

O overlay força `RUN_CRON: ''`, desativando recuperação automática de posts antigos. As três publicações não excluídas em `QUEUE` têm datas entre março e julho de 2026 e permanecem como histórico, sem recriar workflows. Todos os 12 postbacks `PENDING` já expiraram até junho; não foram reativados nem tiveram seu estado reescrito. Redis e Temporal são os exclusivos da nova stack; nenhum histórico/fluxo de execução antigo foi importado.

Gates antes do boot: zero flows ativos, reposts habilitados, AutoPosts ativos, postbacks pendentes ainda válidos e integrações elegíveis no predicado real de refresh. Temporal sem workflows. Não depender do erro já conhecido de inicialização do cron para conter efeitos.

Limites: o boot existente pode aplicar backfills e remover `StatusEvent` com mais de 90 dias e comentários não associados expirados **na cópia**. O dump preserva a fotografia anterior. Webhooks legítimos recebidos ainda podem enriquecer comentários por leitura na Meta; a contenção impede os envios/reposts herdados, não toda consulta externa.

## Operar a cópia recuperada

Para subir toda a stack existente, abrir o Docker Desktop e executar da raiz do repositório:

```bash
docker compose --env-file .secrets/multipost-local.env -f docker-compose.local.yaml -f docker-compose.tunnel.yaml -f docker-compose.restored.yaml up -d --no-build --wait --wait-timeout 300
```

O comando inicia PostgreSQL, Redis, Temporal e app, aguardando os healthchecks. O serviço `schema` deste overlay apenas valida o schema; não executa migração. A imagem local e os volumes recuperados precisam continuar disponíveis. A composição foi conferida com `--dry-run` em 21/10/2026. O conector Cloudflare é um serviço separado no Mac, já configurado, e não é iniciado pelo Compose.

Se os containers já estiverem em execução, mas o frontend travar, reiniciar somente o app com os mesmos três arquivos:

```bash
docker compose --env-file .secrets/multipost-local.env -f docker-compose.local.yaml -f docker-compose.tunnel.yaml -f docker-compose.restored.yaml restart app
```

Usar os três arquivos, nesta ordem. O comando `--no-deps app` pressupõe PostgreSQL, Redis e Temporal saudáveis, banco restaurado e volume externo já existentes; não refaz a recuperação:

```bash
docker compose --env-file .secrets/multipost-local.env -f docker-compose.local.yaml -f docker-compose.tunnel.yaml -f docker-compose.restored.yaml up -d --no-build --no-deps app
docker compose --env-file .secrets/multipost-local.env -f docker-compose.local.yaml -f docker-compose.tunnel.yaml -f docker-compose.restored.yaml ps
```

Se o helper de credenciais Docker voltar a travar, usar o cliente temporário descrito no runbook Docker. Não usar `down -v`. O domínio do app é `https://localmultipost.automacaosemlimites.com.br`; acessar `/auth/login` com e-mail e senha antigos.

Para rollback à homologação vazia anterior, recriar somente o app com os dois arquivos originais, omitindo `docker-compose.restored.yaml`. Isso volta ao banco `multipost`, à chave nova anterior e ao volume `uploads`; não apaga a cópia recuperada. Nenhuma mudança de credencial ou DNS/túnel é necessária. Esse procedimento simples pressupõe o estado verificado nesta recuperação: nenhum workflow no Temporal e nenhuma atividade pendente. Os dois bancos usam Redis e o namespace Temporal `default` da mesma stack; após iniciar novos testes/automações, parar o app e conferir/conter as execuções antes de trocar o banco, ou isolar namespace/cache, para não executar trabalho de um banco contra outro.

## Validação após ativação

Concluída em 20/10/2026:

- Container efetivamente conectado a `multipost_restored_20261020`; `RUN_CRON` vazio, fallback de chave antiga e volume recuperado confirmados. O arquivo privado recuperado prevaleceu sobre as chaves da homologação vazia.
- Usando o Prisma e a criptografia **dentro do app iniciado**, leitura de 6 usuários, 4 perfis e 10 canais, com decifragem das 10 credenciais armazenadas aprovada.
- API pública e `/auth/login` em HTTPS responderam HTTP 200. Tela de login inspecionada no navegador, sem erros no console coletado.
- `/health/workers` respondeu HTTP 200, com filas `main`, `facebook` e `instagram` saudáveis. App `healthy`, com volume recuperado montado em `/uploads`; Temporal permaneceu sem workflows após o boot.
- Contagens das 88 tabelas após o boot permaneceram iguais ao backup; nenhuma remoção de histórico foi observada nessa inicialização.
- Nenhuma publicação, DM, criação de conta, troca de senha ou login automatizado. A validade dos tokens externos e o acesso autenticado continuam pendentes da sessão do usuário.

A falha preexistente `Temporal Service is not initialized` na reconciliação do cron de refresh continua documentada no runbook Docker. Não foi usada como mecanismo de contenção e não impediu API/login/workers de iniciar.
