# SanPost no Coolify — instalacao a partir do fork

Este Compose foi preparado para **Coolify com Docker Compose a partir do GitHub**, utilizando o codigo desta branch (nao a imagem GHCR do fork original).

## 1. Origem e build

- Repositorio: `https://github.com/1sandrovisk1/SanPost`
- Build strategy: **Docker Compose**
- Branch: `main` (depois de aprovar e integrar este PR)
- Base Directory: `/`
- Docker Compose Location: `/docker-compose.yaml`
- **Ative Preserve repository during deployment em General > Build pipeline**. O container `temporal` monta `./dynamicconfig` do repositorio. Sem preservar os arquivos, a montagem pode falhar.
- Mantenha **Compose deployment normal (nao Raw)**, permitindo ao Coolify gerar as labels e a rede do proxy.

O servico `postiz` usa `build.context: .` e `dockerfile: Dockerfile.dev`: o primeiro deploy compila frontend, backend e orchestrator a partir do fork. O build pode consumir bastante RAM/CPU/disco. Para servidores com varias aplicacoes, monitore o uso de memoria; se necessario, futuramente publique uma imagem propria em GHCR via CI.

## 2. Dominio e Cloudflare Tunnel

1. Escolha um dominio HTTPS, por exemplo `https://sanpost.sanchatflow.com` (apenas exemplo, precisa estar configurado no Cloudflare).
2. Em **Coolify > SanPost > Domains**, adicione o dominio **somente para o servico `postiz`**, com porta **interna 5000**.
3. Em **Environment Variables**, defina `SANPOST_PUBLIC_URL` com a mesma URL (sem barra final).
4. No Cloudflare Tunnel, direcione o hostname ao **proxy HTTP interno do Coolify (porta 80)**, conforme as rotas ja existentes no servidor. Nao aponte para 5000, 7233 ou 8080 no host.

O Compose nao publica nenhuma porta no servidor. A UI do Temporal permanece interna (`temporal-ui:8080`) e o Temporal SDK usa `temporal:7233`.

## 3. Segredos gerados pelo Coolify

O Coolify detecta as variaveis do Compose e gera valores persistentes para:
- `SERVICE_PASSWORD_64_SANPOSTDB`: senha do PostgreSQL principal e da URL de conexao;
- `SERVICE_PASSWORD_64_TEMPORALDB`: senha do PostgreSQL do Temporal;
- `SERVICE_BASE64_64_SANPOSTJWT`: JWT_SECRET;
- `SERVICE_REALBASE64_32_SANPOSTKEY`: ENCRYPTION_KEY (32 bytes aleatorios em Base64).

**Nao altere ou regenere a ENCRYPTION_KEY** depois de criar integracoes, pois ela e usada para descriptografar credenciais existentes. Antes do Deploy, confira se as quatro variaveis foram geradas na interface. Nao publique segredos no GitHub.

Variaveis a informar manualmente:
- `SANPOST_PUBLIC_URL` (obrigatoria);
- `SANPOST_DISABLE_REGISTRATION` (padrao `false`): mantenha `false` durante o primeiro cadastro. Se estiver `true`, o backend permite autocadastro somente quando ainda nao existe nenhuma organizacao; em banco ja inicializado o cadastro retorna `Registration is disabled`. Para recuperar uma instalacao ja inicializada sem conta acessivel, defina temporariamente `false`, redeploy, crie/recupere a conta e volte para `true`.

As credenciais de integracoes de redes sociais devem ser fornecidas somente quando forem usadas, nas configuracoes adequadas.

## 4. Persistencia e rede

Volumes do PostgreSQL principal, Redis, arquivos enviados, configuracoes e dados do Temporal foram preservados como volumes Docker nomeados e isolados pelo projeto Coolify.

**IMPORTANTE para quem ja tentou subir a stack**: se o PostgreSQL existente foi inicializado com a senha antiga `postiz-password`, a nova senha gerada nao altera automaticamente a senha no banco persistente. Antes de aplicar em um ambiente com dados, planeje migracao/rotacao de credenciais com backup. Nao apague volumes para resolver erros sem confirmar que nao existem dados importantes.

A rede `temporal-network` nao possui mais nome fixo; o Compose usa redes isoladas por projeto para evitar conflito com outras aplicacoes.

## 5. Validacao antes de abrir ao publico

1. Confira o Compose renderizado em **Show Deployable Compose**.
2. Confira `SANPOST_PUBLIC_URL`, dominio e porta interna **5000**.
3. Execute **Deploy** e acompanhe os logs de build.
4. Verifique que PostgreSQL e Redis ficam saudaveis e o Temporal esta operacional.
5. Acesse o dominio por HTTPS, crie o administrador, teste login e envio/consulta de upload.
6. Apos criar a conta, coloque `SANPOST_DISABLE_REGISTRATION=true` e faca Redeploy. Para uma instalacao ja inicializada sem conta acessivel, siga a instrucao temporaria na secao de variaveis.
7. Verifique se os volumes persistem apos reiniciar a stack.

Se houver erro `failed to bind`, cheque as portas publicadas no **Show Deployable Compose** (nenhuma porta do SanPost deve estar vinculada ao host).
