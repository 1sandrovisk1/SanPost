# Cache do workflow de build

O workflow `.github/workflows/build.yml` cacheia somente o store global do
pnpm. A chave é derivada de `pnpm-lock.yaml`, pois o conteúdo desse store
depende da árvore de dependências, não dos arquivos-fonte da aplicação.

## Por que não usar hash do código-fonte

O `actions/cache` avalia novamente a chave na etapa de pós-execução. Quando a
chave incluía `hashFiles('**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx')`, a
segunda avaliação ocorria depois de `pnpm install` e do build. O glob passava a
percorrer também uma árvore muito maior, incluindo dependências e artefatos, e
podia exceder o limite de 120 segundos do GitHub Actions. O resultado era um
job vermelho mesmo quando testes e build tinham terminado com sucesso.

## Invariantes

- `pnpm install --frozen-lockfile`, testes e build continuam sendo gates;
- uma alteração no lockfile cria uma nova chave de cache;
- arquivos `.next`/`dist` não entram no cache de dependências;
- falha real em instalação, testes ou build continua falhando o job.

Ao investigar uma falha futura, verificar a etapa que falhou. Um erro em
`Post Setup pnpm cache` não deve ser confundido com falha de teste ou de build.

## Memória dos testes na RC.5

Com a ampliação das bibliotecas/SDKs, o processo conjunto de backend e bibliotecas atingiu o heap de 6 GB do runner. O workflow executa as bibliotecas em duas partes (`--shard=1/2`, `2/2`) e o backend em processo separado, todos sequenciais e com o mesmo heap. As partes dividem arquivos completos de teste, sem filtrar casos: a união corresponde às 280 suítes da configuração raiz (243 bibliotecas e 37 backend nesta versão). O orchestrator permanece separado. Diagnósticos TypeScript, instrumentação de cobertura e detecção de handles abertos continuam ativos; relatórios de cobertura/JUnit têm destinos distintos para não se sobrescreverem.
