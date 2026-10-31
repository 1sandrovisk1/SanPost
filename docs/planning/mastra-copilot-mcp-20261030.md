# Último lote — Mastra, CopilotKit e MCP

Base: integração do compositor/fuso em `15c1acc7`, sem deploy. Portar versões usadas pelo Postiz (core 1.67, MCP 1.18, memory 1.30, pg 1.25, CopilotKit 1.72, AG-UI 1.1.4), mantendo AI SDK 5/Zod 3 enquanto os contratos permitirem.

## Contratos

- Modelos continuam resolvidos por chamada e por organização/perfil, com persona e HTTP 412 para credenciais ausentes. Sem uso de chave global ou execução paga nos testes.
- `/copilot/chat` e `/copilot/agent` usam o endpoint HTTP Node. Contexto de canais aceita `forwardedProps.integrations`, com compatibilidade do payload antigo; identidade não vem do prompt.
- `/mcp`, `/mcp-oauth` e conectores existentes mantêm autenticação/escopo. Transporte aceita as eras antiga e nova; streams de assinatura são encerrados após 10 s e timers limpos.
- Schema Mastra espelhado no Prisma, preservando mensagens/threads/recursos, pgvector e tabelas do fork. Conferir diff SQL e dados antigos em banco isolado. Não reutilizar banco existente nos testes.

## Gates

Compilação, testes de contratos/perfil/credencial, MCP HTTP real (`initialize`, `tools/list`, chamada inofensiva), memória em Postgres antes/depois de migração e init repetido, chunking RAG e modelo simulado. Testar render/stream Copilot sem serviço de IA real. Revisões de código, segurança e aceitação antes de consolidar.

## Implementação concluída

- Dependências fixadas: Mastra core 1.67.0, MCP 1.18.0, memory 1.30.0, pg 1.25.0, client-js 1.46.0; AG-UI 1.1.4; CopilotKit 1.72.0. AI SDK 5, Zod 3 e RAG 2.1.3 preservados.
- `/copilot/agent` passa ao endpoint Node. A factory fornece ao adapter um modelo Chat Completions explícito: o getter padrão novo mudaria o endpoint para Responses. A credencial continua resolvida uma única vez por perfil, sem alterar `text()` do Mastra ou expor chave ao controller. O SDK 6 do Copilot usa o modo de compatibilidade V2 para esse modelo. Canais lidos de `body.forwardedProps` no envelope de endpoint único, com fallback para `forwardedProps` direto e `variables.properties`; lista vazia prevalece. Conteúdo de mensagem aceita texto legado ou partes estruturadas de texto. Tipos públicos substituem imports internos removidos.
- O runner padrão do CopilotKit 1.72 compartilha histórico em memória no processo. A auditoria reproduziu vazamento de threads entre organizações e o porte inclui `ScopedCopilotRunner`: namespace derivado de endpoint/organização/perfil autenticados em run, connect, isRunning, stop e leituras. O ID original permanece no input do Mastra e no protocolo. Listagem filtra o namespace; mutações novas e limpeza global ficam bloqueadas. Não acessa APIs privadas do store. Quando o wrapper de telemetria da biblioteca está habilitado, as leituras opcionais locais retornam 422 (ele não expõe essa capacidade); execução, reconexão e parada continuam delegadas ao runner escopado. O Inspector novo é desativado nos três providers do frontend, mantendo a interface técnica oculta.
- MCP mantém OAuth, chave do perfil/organização e conectores legados. Protocolo padrão novo convive com clientes antigos; timers de assinatura só começam após autenticação e são limpos ao fechar.
- Prisma contém as 45 tabelas do SDK, incluindo 37 novas, campos opcionais e seis índices adicionais criados no init real. O nome da chave composta de spans corresponde ao SDK (`public_mastra_ai_spans_traceid_spanid_pk`). A migração recusa spans duplicados, sem deduplicação automática.

## Sincronização segura do banco

`pnpm prisma-db-push` chama `tools/prisma-schema-sync.cjs`. A conexão continua vindo de `DATABASE_URL`/datasource, sem URL nos argumentos ou logs.

1. Introspecta somente para leitura e compara identidades de tabelas, incluindo `@@map`. Banco vazio é aceito somente com P4001; outras falhas interrompem.
2. Preserva integralmente modelos dinâmicos `kb_*` num schema temporário, sem mudar o schema canônico ou gerar modelos vetoriais no cliente da aplicação. Tabelas desconhecidas fora desse namespace interrompem a sincronização mesmo vazias.
3. Calcula o diff real e aceita apenas criação de tabelas/tipos/índices e adição de colunas/constraints. DROP, mudança de tipo/coluna, rename e outras operações não aditivas interrompem o boot. A correção de 31/10 reconhece somente a substituição exata do índice legado de experimentos, sob lock e conferência da tabela padrão do SDK, preservando registros e normalizando tentativas nulas para zero; ver [incidente e limites](../operations/incidente-rc5-indice-mastra-20261031.md).
4. Executa exatamente o SQL inspecionado em `BEGIN/COMMIT`, evitando replanejamento entre validação e aplicação. Gera depois o cliente pelo schema canônico e remove temporários.

Se a geração do cliente falhar, o comando informa que o banco já foi atualizado. Se o plano for recusado, revisar a divergência manualmente; não reintroduzir `--accept-data-loss`. A troca isolada para uma imagem antiga, cujo boot ainda usa essa flag, pode remover as novas tabelas: um rollback precisa preservar o schema atualizado ou restaurar o backup consistente. A migração SQL versionada é alternativa de aplicação; não reaplicá-la após o boot já ter criado os mesmos objetos.

## Validação local

- Backend, frontend e orchestrator: builds de produção concluídos com código de saída 0. TypeScript do frontend passou; corrigidas três anotações de tipos antigas no backend, sem alterar comportamento.
- 70 testes em seis suítes: credenciais/resolver, Copilot, MCP proteção do schema e isolamento do runner. Mais dois testes de normalização de mensagens do frontend.
- `tools/mastra-mcp-proof.cjs`: HTTP real, descoberta e chamada inofensiva de ferramenta em 2025-03-26/2025-11-25; cliente moderno real em 2026-07-28; duas requisições concorrentes mantêm organização/perfil isolados; sem autenticação recebe 401.
- `tools/mastra-copilot-proof.cjs`: controller real, runtime, AG-UI e modelo AI SDK V2 simulado; info, streaming concluído e canais/persona/perfil corretos; leitura positiva do próprio histórico, listagem vazia em outra organização/perfil, leitura/reconexão sem vazamento e limpeza global recusada. Prova adicional do wrapper real de telemetria confirmou reconexão própria e isolamento alheio; uma execução ativa recusou stop de outra organização e aceitou stop do próprio escopo. `/copilot/chat` também foi exercitado com SDK OpenAI real e servidor local: caminho `/chat/completions`, modelo configurado, baseURL customizada, texto e argumentos de ferramenta em streaming até RUN_FINISHED. Nenhum provedor externo é usado.
- Navegador: CopilotKit/CopilotChat/Input reais com runtime local e modelo simulado; envio por botão e Enter, exibição de resposta e canais do payload novo. A rota de QA e os servidores temporários foram removidos. A negociação inicial tenta `/info` e recebe 404 antes de usar com sucesso o endpoint único POST.
- Postgres 17 + pgvector isolados: banco vazio; schema antigo com conversa, mensagem e vetor anteriores; init repetido; leitura/gravação de memória nova; consulta e inserção de vetores. Duas sincronizações preservaram exatamente `pg_indexes.indexdef`, inclusive HNSW. Tabela desconhecida vazia foi recusada e permaneceu intacta.
- `tools/mastra-storage-proof.cjs` reproduz o upgrade e exige banco local vazio chamado `multipost_ai_proof_*`. Usa o schema completo anterior do ancestral `15c1acc7`, espelhamento real do SDK e comando real do boot. As 45 tabelas foram conferidas.
- RAG: chunking local com MDocument, sem embedding ou inferência pagos.
- Revisões de plano, código e segurança identificaram o store global do SDK; a correção foi reproduzida e revisada sem bypass confirmado. Aceitação estática aprovada; nenhum novo bloqueador confirmado após as correções.

Execução das provas de protocolo, na raiz:

```sh
TS_NODE_PROJECT=apps/backend/tsconfig.json node tools/mastra-mcp-proof.cjs
TS_NODE_PROJECT=apps/backend/tsconfig.json node tools/mastra-copilot-proof.cjs
# Somente contra banco descartável local, criado vazio:
QA_DATABASE_URL=postgresql://qa:qa@127.0.0.1:55448/multipost_ai_proof_exemplo node tools/mastra-storage-proof.cjs
pnpm exec vitest run --config tools/vitest.agent.config.mts
```

## Pendências fora deste porte

- Isolamento de históricos entre perfis: `CopilotController.getList/getMessagesList` usa organização como resourceId e já compartilhava conversas entre perfis antes deste lote. O upgrade mantém a separação de credenciais/ferramentas, mas não resolve essa política de histórico. Tratar em ajuste próprio, incluindo acesso ao legado.
- A publicação real de uma thumbnail específica do YouTube continua adiada conforme solicitado. O teste local do primeiro bloco não prova o incidente em produção.
- A versão local do Node é 22.22.3, abaixo do patch 22.23.4 exigido pelo projeto. Os builds passaram nesse ambiente; a imagem/CI mantém o patch exigido. Lint geral continua com a configuração circular anterior.

Sem push, PR, merge em main ou deploy nesta etapa.


## Propostas do doc-maintainer (instruções não alteradas)

- `libraries/nestjs-libraries/CLAUDE.md`: atualizar contagem de tabelas Mastra de 8 para 45; explicar que `prisma-db-push` sincroniza por diff aditivo, sem executar automaticamente os arquivos SQL versionados.
- `libraries/nestjs-libraries/src/chat/CLAUDE.md`: registrar o runner escopado obrigatório em ambos os endpoints e o perigo do store global do SDK; distinguir esse cache da memória persistida legada por organização.

As propostas não foram aplicadas aos arquivos de instruções, conforme a regra do mantenedor. A documentação funcional e operacional deste porte está neste documento.
