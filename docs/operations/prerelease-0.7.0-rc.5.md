# Pré-release 0.7.0-rc.5

## Escopo

Reúne os portes e correções concluídos desde a RC.4: novo compositor responsivo, fuso por usuário, miniatura do YouTube, imagem inline, comentários públicos no preview, exclusão de organizações por administrador da plataforma, Farcaster/Neynar, ajustes Temporal/e-mail, TikTok Business, atualização Mastra/CopilotKit/MCP, áudio em Reels do Instagram, fundos do Facebook, Tumblr e X Articles. Acrescenta o lote pendente de segurança e a paleta das automações.

Cobrança permanece adiada. Clipping e login Apple não fazem parte deste porte. Os ajustes locais de cobrança já presentes são de compatibilidade com o compositor; não habilitam um novo sistema de cobrança.

## Auditoria das branches locais

Comparação por ancestralidade, equivalência de patches e leitura dos consumidores atuais, em 30/10/2026:

| Branch | Resultado |
|---|---|
| `maiconramos/resume-*`, `fix-youtube-thumbnail`, `upstream-ai-mcp`, `upstream-social-extras`, `upstream-x-articles` | Integradas no conjunto do compositor. |
| `fix/security-followups-5-2026-10` / PR #336 | Faltava: incorporado preservando Farcaster, exclusão de organizações e Tumblr. Código OAuth de uso único, revogação, escopo de perfil, DTO de seleção de página, feed como fonte não confiável e redação do Sentry. |
| `codex/automation-section-palette` / PR #340 | Faltava: incorporado. Etapas e nós compartilhados V1/V2 usam a mesma identidade de cores. |
| `feat/status-area-problems` | Comportamento já presente, refatorado em `status.helpers.tsx`; não reaplicar versão antiga. |
| `docs/temporal-v112-canary-log` | Evidências incorporadas ao ADR atual. Não restaurar handoff antigo com gates obsoletos. |
| `feat/isolamento-por-perfil` | Commit altera apenas `graphify-out/*`; nenhuma correção funcional adicional. |
| Branches de backup e patches equivalentes | Sem correção exclusiva pendente identificada. |

Worktrees existentes e arquivos não commitados foram preservados. Arquivos gerados do grafo, relatórios locais, diretórios de agentes e Dockerfile de desenvolvimento não entram na imagem de release. Nenhuma branch foi apagada.

## Publicação

Versão em `package.json` e `version.txt`: `0.7.0-rc.5`. Tag Git anotada `v0.7.0-rc.5` sobre o commit integrado em `main`. O workflow `build-containers.yml` produz `linux/amd64` e `linux/arm64`, publica `ghcr.io/maiconramos/robo-multipost:0.7.0-rc.5` e atualiza `:prerelease`. A branch `release` e a tag `:latest` não são promovidas.

A imagem publicada não aplica deploy à VPS. Validar backup consistente do banco antes da atualização: as tabelas Mastra são aditivas, mas uma imagem antiga com sincronização destrutiva pode removê-las no rollback. Ver [migração e limites](../planning/mastra-copilot-mcp-20261030.md).

A publicação real de uma thumbnail específica do YouTube permanece adiada. Testes locais e mocks de publicação não confirmam comportamento de contas reais ou acesso a APIs de X Articles, Tumblr, áudio Meta e TikTok Business.

## Validação

- Lote de segurança: 90 testes em 14 suítes aprovados. Revisão de segurança sem HIGH/MEDIUM introduzido confirmado.
- Suíte completa backend/bibliotecas: 275 suítes passaram; uma expectativa antiga de ausência de X Articles falhou e foi atualizada para o contrato atual. Regressão da conversão e provider X: 37 testes em duas suítes aprovados. O spy do logger recebeu correção de ciclo de vida com RED→GREEN (25 testes aprovados).
- Orchestrator: 80 testes em 13 suítes aprovados, incluindo replay; uma suíte e um teste explicitamente desativados permanecem assim.
- UI de automações: 338 testes em 46 arquivos aprovados; novas integrações: nove testes em três arquivos; hook de tema/canvas: sete testes em dois arquivos. Contagens de comandos sobrepostos não devem ser somadas como cobertura única.
- Navegador local: 1280px/390px, claro/escuro, preservação de campo após recolher, seleção de nós compartilhados e títulos legíveis. Página temporária removida.
- Build e testes completos no Node exigido são confirmados pelo CI antes da tag. O Node local 22.22.3 permanece abaixo do patch 22.23.4 da imagem.

Para detalhes de cada porte, consultar os planos e guias operacionais correspondentes.

O primeiro CI completo detectou retornos implícitos no validador de X Articles (`noImplicitReturns`) e tipagem de mocks/fixtures nos testes de Tumblr e agendamento de artigos. Corrigidos sem relaxar o tsconfig, desativar diagnósticos ou alterar as expectativas funcionais. O gate completo foi reiniciado após testes direcionados com a configuração normal do Jest.

O mesmo CI atingiu heap de 6 GB no processo conjunto. Bibliotecas passaram a executar em duas partes sequenciais e backend em outro processo, com cobertura/relatórios separados e sem desabilitar diagnósticos; a união das partes preserva a seleção original de 280 suítes.

A primeira parte do CI passou por 1.482 testes sem esgotar memória e apontou um mock antigo do construtor de organização. Atualizados os mocks de organização/perfil para a dependência OAuth adicionada no merge; 34 testes em quatro suítes passaram com a configuração normal. Uma varredura TypeScript de todos os specs confirmou que os diagnósticos restantes em arquivos fora desse caminho já existem sem alteração em `origin/main` (`nowpayments`, `mastodon.custom`, `track`); não foram confundidos com regressões deste porte.

## Gate final aprovado

[CI 41134253535](https://github.com/maiconramos/robo-multipost/actions/runs/41134253535), commit de código `56386112`: 3.154 testes de bibliotecas/backend e 80 do orchestrator aprovados, 41 testes anteriormente desativados preservados. Os três builds de produção passaram em Node 22.23.4. PR #341 integrado preservando o histórico; a alteração posterior de versão não modifica o código validado.
