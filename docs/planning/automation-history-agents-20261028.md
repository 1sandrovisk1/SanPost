# Histórico normalizado para API e MCP

## Contrato

Adicionar leituras sem quebrar `GET /public/v1/automations/:id/executions` nem `getAutomationHistoryTool`, que mantêm seus formatos legados.

- `GET /public/v1/automations/:id/history`: `executionVersion=1|2` (padrão 1), `profileId` opcional conforme chave, `status`, `from`, `to`, `limit` 1–50 e `cursor`; retorna `AutomationExecutionPage` igual ao painel.
- `GET /public/v1/automations/:id/history/:executionId`: resumo, etapas registradas e detalhes técnicos projetados (`AutomationExecutionDetail`). Nenhuma execução, replay ou envio.
- MCP: `getAutomationExecutionHistoryTool` e `getAutomationExecutionDetailTool`. Inputs objeto estrito, sem org/perfil em input. A primeira aceita filtros/cursor; a segunda exige executionId. executionVersion identifica explicitamente o motor.
- Capabilities informa o novo histórico, limites/filtros e operações. A facade resolve perfil pela chave/contexto antes de delegar ao mesmo AutomationHistoryService do painel. Repository continua conferindo organização/perfil/fluxo/motor/execução.
- DTO/schema compartilhados; rejeição de parâmetros desconhecidos/inválidos; `no-store` e throttle de leitura. Sem snapshot/erro bruto, credenciais ou novo schema Prisma. A política do ThrottlerBehindProxyGuard deve incluir explicitamente as novas leituras públicas e o histórico privado; o decorator isolado não ativa o guard nessas consultas. Validação Zod ocorre na facade também, sem depender do DTO HTTP. Legado não é removido.

## Verificação

TDD: service/facade mapeia versões, recusa inválidos e mantém contrato antigo; HTTP valida filtros/cursor/versão/chave de perfil e documenta Swagger; MCP valida schemas concretos, delegação e erro sem expor segredo; verificar registro DI/catálogo. Reaproveitar regressões do histórico para escopo, prioridade de UNKNOWN e projeção.

Build backend/worker quando necessário e restart do app existente, sem criar imagem. Leituras reais no Escorpiano; operações de criação/edição/agendamento ficam em uma prova separada e identificada, com credenciais fornecidas em `.secrets/agent-e2e.env`, sem imprimir valores. Não consolidar na main antes do teste completo e da prova de vídeo não publicado pedidos pelo usuário.

## Preparação das provas reais

Preparar um roteiro reproduzível para REST/MCP, com inventário de IDs de teste, estado e snapshots de edição. Teste de envio só no Escorpiano; nunca usar regras ou posts de produção como fixtures. Para Dark Post, preparar um vídeo neutro e instruções de rascunho no Gerenciador: criar uma publicação nova não publicada, não reutilizar o Reel já publicado, não ativar campanha/orçamento. Comentar com outra conta continua sendo etapa humana quando não houver sessão adequada.

## Resultado da primeira rodada, antes do preenchimento do acesso

- Histórico normalizado implementado em REST/MCP, com contratos legados preservados. Swagger da instância local confirma as duas rotas e cinco schemas de resposta. Backend recompilado com Node 22 e reiniciado na imagem existente; container saudável e consulta anônima continua recusada com 401. Não houve migração nem criação de imagem.
- TDD: RED das rotas/delegação ausentes observado; suites direcionadas aprovaram 17 testes HTTP e 78 de domínio/MCP/projeção. Revisão identificou bypass de HEAD; quatro regressões reproduziram o erro e ficaram verdes após a correção (suite de throttle com 22 casos). Total dos casos direcionados: 99. A nova suite HTTP isolada também concluiu com `--detectOpenHandles`, exit 0. Suítes legadas carregam timers na importação; a execução agregada que passou os asserts foi encerrada após o aviso de handles abertos.
- Build backend exit 0 e `git diff --check` sem erros. Revisões de código, segurança, documentação e aceitação sem bloqueadores após correção HEAD. Nenhuma edição em CLAUDE/AGENTS.
- Vídeo neutro inspecionado: MP4 H.264/yuv420p, 720×1280, 8 segundos. Roteiro de acesso e prova em `docs/operations/prova-agentes-dark-video-20261028.md`.
- Naquela rodada inicial, as chaves API/MCP ainda não estavam preenchidas no arquivo privado. Portanto não houve chamada autenticada real via essas credenciais nem prova completa de edição/agendamento/publicação/resposta por agente. Dark vídeo novo não publicado continua aguardando a criação do post pelo responsável. Main preservada, sem PR/merge nesta rodada.

## Ajuste observado na prova real: miniatura duplicada de Reel

Antes do primeiro comentário, o agendamento Facebook publicou com ID de vídeo, enquanto a galeria remota retornou o ID composto do Page Post e o permalink do mesmo Reel. A etiqueta foi removida corretamente, mas as duas referências geraram tiles duplicadas. Revisão do plano confirmou correção somente visual: helper puro conserva comparação exata por ID e, somente para Facebook publicado, reconhece ID numérico de permalink HTTPS de Reel em host Facebook permitido. Remoto explicitamente selecionado permanece visível; nenhum match por legenda/imagem/sufixo. Preservar modo, ID interno, vínculos e executor. Acrescentar regressões RED/GREEN para tile/modal, URLs inválidas/outro Reel/Instagram e seleção explícita. Não resolver aliases nem fazer chamadas Meta extras.

## Continuação com acesso fornecido

As chaves foram preenchidas pelo responsável e a prova real está registrada cronologicamente em `docs/operations/prova-agentes-dark-video-20261028.md`. Criação/edição/reagendamento/publicação e recebimento único por Instagram/Facebook/Messenger passaram. VIDEO28 também teve uma execução, uma resposta privada e recebimento único com botão confirmado; as quatro regras temporárias estão pausadas. O vídeo criado pelo caminho do Gerenciador retornou `is_published=true`, portanto a prova estrita de vídeo não publicado permanece sem comprovação, dependendo de novo teste ou decisão expressa para consolidar com ressalva. A correção visual do Reel passou 27 testes e revisão de código/segurança; navegador confirmou uma miniatura na faixa/modal, sem Agendado e sem modificar seleção. Console sem erros. Nenhuma nova imagem Docker, PR ou merge.

O responsável decidiu aguardar a prova estrita; não consolidar com ressalva. Nova tentativa VIDEODARK28 preparada no formulário “Criar post”, cujo botão principal indica “Salvar post não publicado”. Aguardar seleção manual da mídia (extensão sem acesso a arquivos locais), conferir opções após anexar e validar `is_published` do ID gerado antes de ativar a regra.

Após o novo upload, o compositor de vídeo abriu com “Publicar agora” marcado. O agente mudou explicitamente para “Salvar como rascunho”, conferiu Escorpião Veneno e salvou; Meta confirmou o salvamento e indicou a aba Pré-publicados. Obtenção do ID aguarda o responsável concluir a reautenticação 2FA solicitada pela gestão de posts. Não há nova regra ativa, anúncio publicado ou alteração de orçamento nessa tentativa.

## Resultado final das provas e consolidação

As pendências das etapas históricas acima foram encerradas. Após 2FA, o rascunho editorial foi localizado, mas não era consultável pela integração. Uma criação separada pela API da Página com `published=false` e `unpublished_content_type=ADS_POST` gerou vídeo `1927476588631377`, Page Post `271852286004401_122322703106221279`, confirmado não publicado antes/depois. O perfil pessoal Maicon Ramos comentou VIDEODARK28; uma execução e uma DM aceita às 09h37min46s (Brasília), com recebimento único e botão confirmado pelo responsável. Resumo e detalhe iguais no REST/MCP; quinta regra temporária pausada. Acesso por conta externa não foi comprovado, sem campanha ativada ou orçamento alterado.

Gate pré-main atendido. Branch sincronizada com main `e06ab2ce`, preservando alterações de outros trabalhos; conflito somente de traduções resolvido conservando todas as chaves. Revisão final encontrou perda potencial de reações em Story com palavras-chave na troca para editor rápido; guarda e regressões foram acrescidas para manter essa combinação no construtor. Verificações finais do conjunto integrado antes de abrir e integrar o PR. Nenhuma nova imagem Docker ou migração própria desta entrega.

Conjunto integrado aprovado: 279 testes UI/37 arquivos, 99 testes Jest/8 suítes, TypeScript frontend, build frontend e compilação backend isolada com o tsconfig do Nest. Revisões de código, segurança, documentação e aceitação sem bloqueadores após a correção Story (RED reproduzido/GREEN). Navegador conferiu histórico VIDEODARK28, uma DM aceita e estado pausado, sem erro/aviso de console. Todas as 2.727 chaves pt/en têm paridade; diff sem whitespace inválido. Sem alteração de artefatos backend em execução ou migração nesta consolidação.
