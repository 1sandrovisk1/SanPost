# Sincronização local com o worktree de segurança — 25/10/2026

## Origem e preservação

O worktree `security`, branch `fix/providers-yt-pt-tt-2026-10`, estava em
`f2c9c6dc318e637594e11874a6ff2d9013531ffa` (v0.6.1). A branch local
`codex/facebook-shared-automations` partia de `b6686fe0` (v0.5.6), sem commits
exclusivos posteriores: foram incorporados os 11 commits por fast-forward.
As alterações não commitadas de Facebook, automações e interface Meta foram
reaplicadas sobre essa base. Os arquivos gerados não commitados do worktree de
origem não foram importados.

Antes da operação, foi criado um arquivo privado com os arquivos locais
modificados/não rastreados, patches, estado do Git e hashes SHA-256. O caminho
está em `.secrets/last-worktree-sync-backup.txt`; o `manifest.json` registra os
commits e o stash preservado. O mesmo diretório contém um dump custom do banco
`multipost_restored_20261020`, com catálogo conferido. Não versionar esse material.

## Combinação das mudanças

- `facebook.provider.ts`: preservados os escopos da automação, `auth_type=rerequest`,
  validações, paginação e sanitização locais; incorporados `makeSecureId` para o
  OAuth e `@DashboardFunction()` em `pages`.
- `package.json`: dependências, overrides e engines da v0.6.1, mantendo os quatro
  scripts locais de prova/regressão. `pnpm-lock.yaml` não foi recalculado.
- `CHANGELOG.md`: mudanças locais ficam em `Unreleased`; releases 0.6.0/0.6.1
  mantidas com suas entradas de segurança.
- Imagem local completa: `var/docker/local.Dockerfile` usa
  `node:22.23.4-trixie-slim`. O incremental aponta para
  `multipost-facebook-local:security-sync-20261025`, evitando reutilizar a base
  antiga com dependências anteriores. Capturas em `output/` ficam fora do build.

## Banco e execução

Não há mudança de schema entre a base de segurança e a base anterior; o schema
local de automações V2 foi preservado. Não executar `prisma-db-push`, `down -v`
ou prune para essa sincronização. A migração de cookies Skool da v0.6.0 é
automática no boot; a consulta prévia encontrou **zero** integrações Skool no
banco recuperado.

O app local usa os quatro overlays descritos em
[recuperação local](multipost-local-recovered.md) e
[automações compartilhadas](facebook-shared-automations.md). Manter `RUN_CRON`
vazio, os volumes existentes e os limites de teste do Escorpiano. Não renovar
tokens, assinar outras Páginas ou enviar mensagens para validar esse sync.

## Validação

- Instalação com `pnpm install --frozen-lockfile`: concluída, sem alteração do lock.
- Interface Meta e criador compartilhado: **86 testes / 14 suítes**.
- Regressão Facebook/Instagram: **502 testes / 34 suítes**, com cinco testes de
  uma suíte já ignorada pelo projeto. Nenhuma chamada real à Meta nessa execução.
- Segurança, autorização e escopo de credenciais: **246 testes / 20 suítes**.
- Orchestrator/Temporal (incluindo replay e fluxo compartilhado): **24 testes /
  cinco suítes**.
- TypeScript do frontend: `tsc --noEmit --incremental false` aprovado.
- Build Linux do backend e orchestrator: aprovado em Node 22.23.4/trixie.
- Revisões de código e segurança: sem bloqueadores; corrigida uma entrada local
  do changelog que o merge havia colocado na release antiga.
- Comparação dos 197 arquivos do backup: somente os seis arquivos esperados
  diferem (`.dockerignore`, changelog, provider Facebook, package e Dockerfiles
  locais). Os demais arquivos locais foram preservados byte a byte.

Os testes e o TypeScript acima rodaram no Node 22.22.3 do host, com aviso de engine
inferior ao mínimo da nova base. O build e o runtime Docker usam Node 22.23.4;
não foi alterado o Node global da máquina. As versões corrigidas vêm do lockfile
do worktree `security`; esta operação não substitui uma nova auditoria completa
de todos os advisories ou um teste real em cada provider.

### Ambiente iniciado

Somente `app` foi recriado com os quatro overlays, `--no-deps --no-build`.
A imagem `security-sync-20261025` e o alias local `:source` apontam para
`sha256:9c61674213b38b2c0170b1b7034ec956037a4fa887dc3e3ac7430becff307201`.
Confirmados no container: Node **22.23.4**, nginx **1.26.3-3+deb13u10**, estado
`healthy` e zero reinicializações na verificação.

O healthcheck do orchestrator em `127.0.0.1:3002/health/workers` retornou 200,
com `main` (workflow), `facebook` e `instagram` (activities) saudáveis. O bundle
Temporal compilou e os workers iniciaram. Login/frontend e API pelo túnel
retornaram 200. A sessão existente do Escorpiano abriu as credenciais Meta e
preservou o estado **Recebimento configurado**. A listagem `/automacoes` exibiu
**Teste Facebook — Escorpiano** ativa, para uma publicação selecionada, com
histórico disponível. Console de erros do navegador vazio nessa navegação.

Os dois erros de boot `reconcileRefreshTokensCron: Temporal Service is not
initialized` já documentados no [runbook local](multipost-local-docker.md)
continuam presentes. Não são novos neste sync e não impedem API, interface e
workers de iniciar; a renovação proativa global permanece fora desta validação.
(Corrigido em 28/10/2026: a reconciliação passou para `onApplicationBootstrap`.)
Nenhuma credencial foi renovada e nenhuma mensagem/publicação real foi enviada.

## Retorno seguro

O stash e o backup privado permanecem disponíveis. A imagem anterior
`multipost-facebook-local:meta-help-20261025` também foi preservada. Para voltar
apenas o runtime, restaurar a tag local `:source` para essa imagem e recriar
somente `app` com os quatro overlays, `--no-deps --no-build`. Isso não desfaz o
código sincronizado. Não restaurar dump nem sobrescrever arquivos com trabalho
mais recente sem comparar primeiro o estado registrado no manifesto.
