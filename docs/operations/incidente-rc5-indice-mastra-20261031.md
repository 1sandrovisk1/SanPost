# Incidente RC.5: índice legado do Mastra bloqueia o boot

## Diagnóstico confirmado

Em 31/10/2026, o serviço com a imagem `0.7.0-rc.5` reiniciava na sincronização do Prisma, antes de iniciar os processos da aplicação. O SQL real continha 67 comandos. O único recusado era `DROP INDEX "idx_experiment_results_exp_item"`.

O banco existente tinha um índice único sobre `mastra_experiment_results(experimentId, itemId)`. O SDK Mastra PostgreSQL 1.25 substitui esse índice pela combinação `(experimentId, itemId, attempt)`, chamada `idx_experiment_results_exp_item_attempt`. A inicialização do SDK contém explicitamente essa migração; o guard do boot interrompia antes que o SDK pudesse executá-la. A tabela de experimentos estava vazia.

A prova anterior de atualização partia do schema Prisma antigo ideal e não incluía esse índice criado em execução pelo SDK. Isso deixou o caso legado fora da validação da RC.5. A proteção recusou o plano antes do comando `db execute`.

## Recuperação aplicada

1. Backup custom do PostgreSQL em diretório privado, validado por `pg_restore --list`.
2. Restauração do backup em container PostgreSQL 17 descartável, sem portas publicadas e sem rede externa. Nenhuma aplicação foi iniciada contra a cópia.
3. Plano transacional controlado: conferir definição exata do índice, método btree, unicidade, validade, ausência de predicado/expressão/colunas extras e de dependências em `pg_constraint`; exigir tabela vazia e manter lock durante a alteração. Aplicar os comandos aditivos, verificar o substituto e só então remover o índice antigo, sem CASCADE.
4. Prova na cópia: contagens das 96 tabelas originais preservadas; diff vazio após a migração e após duas inicializações do SDK.
5. Aplicação em produção do mesmo SQL, conferido por SHA-256. A proteção geral do script não foi desativada e a imagem/configuração do serviço não foram trocadas.

Os 1.544 posts, 28 canais e seis perfis mantiveram contagens e hashes idênticos durante a migração. Backend público e página de login responderam HTTP 200; frontend, backend e orchestrator ficaram online sem reinício dos processos; `/health/status` e `/health/workers` do orchestrator responderam HTTP 200 com poller da fila principal.

O backup deste atendimento está em `/root/multipost-backups/rc5-boot-incident-20261031T150803Z/database-before.dump`, com permissões restritas. Os schemas, planos, checksum e provas ficam no mesmo diretório privado. Não armazenar DATABASE_URL ou credenciais em documentação/logs.

## Correção para próximos upgrades — RC.6

O patch reconhece somente essa migração legada conhecida. O catálogo e as dependências são conferidos dentro da transação, com lock exclusivo. A tabela deve ser uma tabela comum do SDK, com as duas chaves não nulas e sem herança, particionamento, RLS, triggers de usuário ou regras de reescrita. Uma estrutura inesperada interrompe a operação.

Depois de criar e verificar o índice novo, confere `attempt` como inteiro normal e transforma somente valores NULL em zero. O SDK já interpreta NULL como tentativa zero na leitura e no upsert; IDs, conteúdo e demais campos permanecem iguais. Valores de tentativa já preenchidos são preservados. O índice antigo só é removido depois dessas etapas, sem CASCADE. O lock e a unicidade antiga por par asseguram que essa normalização não produza colisões no índice novo.

`assertAdditiveSql` continua recusando DROP e UPDATE genéricos. O UPDATE é um comando fixo emitido apenas nessa migração validada, não uma permissão para aceitar alterações vindas do diff.

Se houver outra definição/dependência, estrutura personalizada ou outro comando não aditivo, a atualização continua interrompida e exige revisão. Não usar `--accept-data-loss` ou rollback cego para RC.4: a imagem antiga sincroniza o schema de modo destrutivo e pode remover tabelas novas.

## Regressões reproduzíveis

`schema-sync.spec.ts` cobre os planos aceitos/recusados e mantém o validador genérico fechado. `tools/mastra-legacy-index-proof.cjs` exige banco vazio descartável em loopback, sem query de conexão, com nome `multipost_schema_proof_*`. Cria fixtures e executa dez recusas reais: índice em outra tabela, parcial, pertencente a constraint, dependência FK, search_path diferente, chaves legadas anuláveis, trigger, regra de reescrita, RLS e herança. Após cada recusa, confere rollback, linhas preservadas e ausência de coluna/índice novos. Testa upgrade vazio e parcial populado, preservando IDs/conteúdo e tentativa 7, normalizando só NULL para 0, seguido de duas transações de boot vazio.

`tools/mastra-storage-proof.cjs` agora inclui a tabela e o índice criados pelo SDK antigo, com um resultado salvo antes do upgrade. O comando real de boot deve preservar todos os campos originais e acrescentar `attempt=0`. Um upsert real do SDK deve reutilizar o mesmo ID, sem criar linha extra. Memória, vetores, índices HNSW, 45 tabelas Mastra e duas sincronizações repetidas continuam conferidos. As duas provas só podem usar bancos locais descartáveis.

A recuperação deste atendimento manteve a imagem RC.5 original. A correção é destinada à RC.6 e à atualização do canal `:prerelease`, para que outras instalações recebam a migração no boot.

Resultados: 20 testes Jest aprovados; dez recusas PostgreSQL com rollback; upgrade vazio/populado e repetição; prova completa de memória/vetores/SDK com dado legado e upsert real. O ensaio anterior com o backup real também passou antes da recuperação da VPS. Nenhum teste adicional de SDK usou o banco de produção.
