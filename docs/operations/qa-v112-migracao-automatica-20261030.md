# QA — V112 padrão e migração automática (30/10/2026)

## Resultado local

Implementação preparada para novos agendamentos V112 de todos os providers,
incluindo Zernio, e migração automática dos workflows legados futuros elegíveis.
Não há migration SQL nem configuração de IDs por instalação.

- 78 testes direcionados de domínio passaram: seleção, repository/service da
  migração, bootstrap, contratos de criação e guarda de republicação, Zernio.
- 23 testes do orchestrator passaram: activities, singleton, bundle e replay,
  incluindo histórico V112 anterior sem o marcador de persistência do aceite.
- Um teste com servidor Temporal isolado passou: substituição de V102 real em
  timer, retomada após falha entre término/início, chamadas concorrentes, retorno
  aceito durável, falha transitória na escrita, um único envio Zernio simulado,
  resultado parcial e replay de V102/V112 com marcador.
- Builds de backend e orchestrator passaram com Node 22.23.4.
- `git diff --check` passou.

RED foi observado na seleção V112, métodos pending ausentes, serviço/workflow de
migração ausentes e guarda QUEUE sem proteção. Os testes passaram após as mudanças.

## Ambiente isolado

Dependências instaladas com o lockfile existente, Prisma Client gerado localmente
e binding bcrypt reconstruído. Node 22.23.4 oficial teve SHA256 conferido. O
Temporal de teste usa somente `127.0.0.1:17233`, sem conexão com redes sociais ou
com o banco de produção. A fixture de replay é sintética e sanitizada.

Para repetir a integração, subir um servidor Temporal de desenvolvimento
exclusivo na porta indicada e executar, da raiz:

```bash
RUN_TEMPORAL_MIGRATION_INTEGRATION=true pnpm exec jest \
  --config apps/orchestrator/jest.config.ts --runInBand --no-coverage \
  --testTimeout=30000 --testPathPattern=post-workflow-migration.integration.spec
```

A suíte normal deixa esse teste externo desativado. As demais verificações
rodam sem servidor Temporal de teste.

## Limitação preexistente do lint

O `package.json` da raiz não define `lint`. A chamada direta ao ESLint com o
`eslint.config.mjs` existente falha antes da análise com
`TypeError: Converting circular structure to JSON`, no adaptador FlatCompat e
configuração do plugin React/Next. Não foi alterado esse setup fora do escopo.
Não declarar lint aprovado.

## Revisões

Revisões de plano, código, segurança, documentação e aceitação realizadas. Os
achados sobre prazo do término, referência aceita da Zernio e guarda durante
QUEUE foram incorporados. O limite de resultado desconhecido antes de o aceite
chegar ao Temporal e a janela da persistência estão documentados no runbook;
não há promessa de garantia absoluta de envio único.

## Produção: somente prévia

A inspeção autenticada, somente em leitura, encontrou 49 posts futuros elegíveis,
sete em cada provider: Facebook, Instagram, LinkedIn, LinkedIn Page, Threads,
YouTube e Zernio TikTok. Os 49 passaram pelas provas de identidade, snapshot,
histórico sem envio e timer inicial com margem. Nenhum adiamento nessa prévia.

Nenhum post, workflow, credencial, imagem ou configuração de produção foi
alterado para realizar esta validação. Publicação da imagem e migração efetiva
precisam de registro separado após o deploy e readback dos workflows/datas.

## Atualização

Seguir [o runbook](temporal-v112-atualizacao-automatica.md). Usar deploy coordenado
sem workers antigos consumindo contratos novos. Não usar reset para trocar a
versão. Confirmar o singleton, a versão de cada substituto e preservação de datas
antes de declarar migração concluída. Acompanhar as primeiras publicações reais.
