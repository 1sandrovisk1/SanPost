# Paridade de automações na API e MCP

## Contrato e escopo

Superfície aditiva `/public/v1/automations`, preservando `/flows` e `/flows-v2`. API e MCP passam pela mesma fachada de serviços de domínio. Identidade vem da chave/contexto autenticado; chave de perfil não escolhe outro perfil. Sem contexto de perfil, usar somente o perfil Default da organização, nunca buscar uma regra em todos os perfis como fallback.

O contrato declarativo inclui plataforma, gatilho, conta, modos de publicação, postIds/storyIds, scheduledPostId interno, palavras-chave/correspondência, reações ao Story, resposta pública única/variações, DM/botão/link, todos os campos do follow-gate e prioridade do Messenger. Campos incompatíveis devem falhar antes de qualquer gravação. Retorno de detalhe inclui configuração recuperável e grafo; edição rápida de grafo personalizado é recusada. Edição por grafo é explícita. Facebook V2 exige revisão esperada na edição; a semântica do motor Instagram legado permanece identificada.

| Recurso | Instagram comentário | Instagram Story | Facebook comentário | Messenger |
|---|---|---|---|---|
| Publicações | todas/específicas/próxima/agendada | todas/específicas/próxima | todas/específicas/próxima/agendada | não se aplica |
| Palavras-chave e correspondência | sim | sim | sim | obrigatórias |
| Resposta pública e variações | sim | não | sim | não |
| DM e botão/link | sim | sim | sim | sim |
| Follow-gate completo | sim | seguir/mensagem | não | não |
| Reações | não | sim | não | não |
| Dark Posts | aliases | não | resolver ID/URL e postIds | não |
| Prioridade/conflito | motor legado | motor legado | motor V2 | prioridade 1–1000 e deduplicação V2 |

Descoberta deve oferecer capacidades, canais, publicações, Stories, agendados, resolução de publicação Facebook e diagnóstico de prontidão sem tokens. Gerenciamento inclui criação, lista, detalhe, edição, status, histórico, grafo e aliases Instagram. Repost continua domínio separado e expõe seu contrato completo, candidatos, CRUD, estado e logs; execução imediata e reinício de checkpoint são operações explícitas, nunca efeitos de consulta.

Não expor tokens, App Secret, verificação de webhook nem testes manuais de envio como parte de configuração de automação. QR code, ref links e Story Facebook continuam fora das capacidades. Reaproveitar autorização, webhook, reservas agendadas e deduplicação existentes, sem novos envios reais durante esta revisão.

## Validação

TDD com matriz de campos, rejeição de combinações/unknown, ida e volta detalhe→edição, proteção de grafos personalizados, conta imutável em update rápido, aliases/histórico no perfil correto, revisão V2, ferramentas registradas e schemas MCP concretos. Testes locais de contrato e banco isolado; qualquer prova Meta permanece somente Escorpiano.

## Entrega e evidências — 27/10/2026

- Referência canônica: [Automações por API e MCP](../api/automations-agent-api.md). Os 26 campos declarativos incluem todos os campos do DTO rápido Instagram (snapshot de edição separado), plataforma, prioridade Messenger e aliases. O contrato inclui também o grafo completo e os campos do domínio separado de repost.
- `AutomationManagementService` concentra o escopo e os adaptadores dos dois motores. `PublicAutomationsController` foi registrado no grupo autenticado da API. Dez ferramentas MCP delegam à mesma fachada, registradas por DI e com schemas de entrada concretos.
- Edição V1 usa `expectedUpdatedAt` e CAS transacional em `ScheduledPostsRepository.saveLegacyCanvas`; V2 usa revisão esperada. Campos omitidos e metadados de layout são conservados; um grafo com ramificações exige edição explícita de canvas. Conta/gatilho/rede não mudam no patch rápido.
- Rascunho Instagram passa por `createDraftFlow`, com guarda de integração/perfil e sem preflight Meta. Ativação explícita revalida o canal/webhook. Facebook exige ação válida mesmo em rascunho. Se a criação já salvou e uma etapa posterior falhou, o retorno mantém ID e `saved=true`, para retomar sem duplicar.
- Revisão de código corrigiu roundtrip de opcionais nulos no canvas, resposta pública Facebook sem DM, alias indevido em Story e nome vazio do canvas. Descoberta inclui `{commenter_id}`. No repost, o filtro persistido `filterIncludeVideos=false` agora é respeitado antes de download/publicação, com defaults e filtro de imagens preservados.

Validações executadas:

| Camada | Resultado | Evidência local |
|---|---|---|
| Regressão Meta/Flows | 737 testes, 42 suítes; 23 casos de ambiente pulados | `/tmp/multipost-api-mcp-final-regression.log` |
| Services após ajuste final de draft | 113 testes, 2 suítes | `/tmp/multipost-api-mcp-final-draft.log` |
| Ferramentas MCP e repost | 50 testes, 7 suítes | `/tmp/multipost-api-mcp-final-tools.log` |
| HTTP e Swagger | 5 testes | `/tmp/multipost-api-mcp-final-http.log` |
| PostgreSQL isolado | 26 testes; banco temporário removido | `/tmp/multipost-api-mcp-db.log` |
| Runtime REST | capabilities HTTP 200 no perfil Escorpiano; quatro gatilhos corretos | consulta local autenticada, sem mutação |
| Runtime MCP | initialize/tools/list HTTP 200; dez tools presentes, raiz objeto e sem identidade forjável; create com 26 campos | catálogo de 22 tools, sem executar ações |

As contagens são por rodada, com sobreposição; não somar como testes únicos. Uma execução combinada inicial atingiu o limite de heap do Jest; a repetição por projeto com heap explícito de 8 GiB passou. Não foi falha funcional nem houve dependência nova.

Para conferir o catálogo MCP foi usada a chave de organização já existente, porque o perfil Escorpiano não tinha chave própria. Somente initialize e tools/list foram chamados; nenhuma ferramenta foi executada nesse contexto. A REST recebeu explicitamente o perfil Escorpiano. Nenhuma chave/token foi impressa, criada ou alterada.

Sem nova imagem Docker, mudança de dependências, migração de schema ou prova de envio nesta tarefa. A imagem local continua `sha256:de4e3f969a83f8b0bbb9fc5889aed501cc6cc8e48690e6d133af3cc35bbbbb00`; `pnpm dev:local` recompila backend/worker e reinicia a aplicação existente. Endpoints legados, credenciais e automações reais foram preservados. Provas de Dark Post com vídeo exclusivo de anúncio permanecem pendentes conforme o histórico anterior; esta entrega não as presume concluídas.

## Manutenção de instruções proposta

O doc-maintainer apontou descrições Instagram-only antigas nas três tools em `libraries/nestjs-libraries/src/chat/CLAUDE.md` e sugeriu referências à fachada nos mapas backend/libs, além do pitfall de concorrência/quickEditable. São propostas opcionais de atualização de instruções, sem edição automática de CLAUDE.md/AGENTS.md nem bloqueio da entrega. A documentação de produto acima já descreve o comportamento vigente.
