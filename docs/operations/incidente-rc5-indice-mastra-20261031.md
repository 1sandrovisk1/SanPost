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

## Correção para próximos upgrades

O patch de código para próximos upgrades faz o boot reconhecer somente essa migração legada conhecida, com verificações de catálogo e tabela vazia dentro da transação. O índice novo é criado antes da remoção do antigo. `assertAdditiveSql` continua recusando DROP genérico e mudanças destrutivas; todo o restante do plano continua passando por esse validador.

Se a tabela contiver resultados de experimentos, se o índice tiver outra definição/dependência ou se aparecer outro comando não aditivo, a atualização continua interrompida e exige uma migração específica revisada. Não usar `--accept-data-loss` ou rollback cego para RC.4: a imagem antiga sincroniza o schema de modo destrutivo e pode remover tabelas novas.

## Regressões reproduzíveis

`schema-sync.spec.ts` cobre os planos aceitos/recusados e mantém o validador genérico fechado. `tools/mastra-legacy-index-proof.cjs` exige banco vazio descartável em loopback, sem query de conexão, com nome `multipost_schema_proof_*`. Cria apenas fixtures e confere recusa de tabela preenchida, nome de índice em outra tabela, índice parcial, índice de constraint, dependência de chave estrangeira e search_path diferente. Após cada recusa, verifica rollback, preservação de linhas e ausência de coluna/índice do upgrade. Por fim executa a migração válida e duas transações de boot vazio. Não executar contra produção.

A restauração deste atendimento manteve a imagem RC.5 original. O patch do repositório precisa integrar uma próxima imagem para corrigir automaticamente outras instalações com o mesmo legado; a migração manual já recuperou esta VPS.

Resultados do patch: 20 testes Jest aprovados; seis casos de catálogo/linhas recusados no PostgreSQL real com rollback e estado preservado; upgrade automático usando o backup real em banco isolado passou, assim como a segunda execução do comando real de boot. O container descartável e os arquivos temporários de conexão são removidos ao concluir a validação.
