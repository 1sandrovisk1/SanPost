# Histórico de execuções no ambiente da automação

## Escopo

Padronizar Instagram V1 e Facebook/Messenger V2 na aba Histórico existente: tabela operacional, filtro de situação/período, atualização e paginação; botão de detalhes abre drawer acessível com entrada, etapas registradas, resultados e detalhes técnicos permitidos. Datas seguem o idioma (pt-BR em português) e o fuso do navegador. Não modificar disparos, publicar conteúdo, reconstruir histórico nem implementar inspetor/prévia nesta rodada.

A análise visual será usada no histórico. Os motores têm registros diferentes: V1 possui executionLog; V2 possui snapshot de evento e ledger de entregas. A interface comum deve mostrar esses fatos, sem fabricar passos, confirmar entrega ao destinatário pela aceitação da API ou expor snapshot/payload/erro bruto. Mensagem aguardando clique é pendência, não falha. Envio de resultado desconhecido não terá botão de reenviar.

## Contrato antes do código

Nova leitura autenticada `GET /automation-history/:engine/:flowId`, com engine `instagram|shared`, query validada `status` (all/completed/waiting/failed/running/skipped/unknown), `from`, `to` ISO, `limit` 1–50 (padrão 25), `cursor` opaco com data/ID. Resposta `{ items: AutomationExecutionSummary[], nextCursor: string|null }`. Filtros são aplicados no servidor; sem contadores totais inventados.

`GET /automation-history/:engine/:flowId/:executionId` retorna `AutomationExecutionDetail`: resumo, etapas reais e referências técnicas permitidas. A entrada Messenger é identificada como mensagem, comentários e respostas de Story respeitam o gatilho registrado. V2 só revela campos expressamente projetados do snapshot; não retorna JSON arbitrário, tokens nem resposta bruta do provedor.

Controller autenticado → AutomationHistoryService (normalização/projeção) → AutomationHistoryRepository (Prisma). Todas as leituras exigem organização e perfil ativo e conferem flowId + executionVersion + executionId. Nenhuma migração, mudança de executor ou quebra nos endpoints antigos/públicos/MCP. DTO compartilhado em libraries/nestjs-libraries/src/dtos/flows.

## UI e navegação

Um componente de histórico recebe engine/flowId, consome o contrato comum e substitui os dois históricos dentro da aba existente. A lista usa Participante, Interação, Canal/gatilho, Situação e Início; dados indisponíveis aparecem explicitamente. Detalhes via botão acessível e drawer nativo já utilizado no produto, com Escape/foco/retorno à lista. Erro/vazio/carregamento/refetch distintos, preservando filtro e página ao fechar detalhes. Atualização automática somente enquanto a aba está montada; detalhe recarrega até estados finais.

No Histórico, nome fica somente leitura e Salvar fica oculto; o rascunho continua montado e o aviso de alterações não salvas permanece visível. Ativar com rascunho pendente não deve gravá-lo indiretamente por um toggle em uma tela de consulta: informar que é necessário voltar ao editor. Pausa continua disponível. A barra e os três modos permanecem na mesma tela.

## Verificação

Backup temporário antes da mudança. TDD de filtros/cursor, escopo por organização/perfil/fluxo/execução, projeção sem credenciais, logs inválidos/desconhecidos, aceito versus entregue, estados e drawer, paginação/filtros/refetch, datas e rascunho no Histórico. Revisões de plano, código/segurança, documentação e aceitação. Suítes frontend/backend focadas, TypeScript/build e conferência no navegador local Escorpiano somente leitura; nenhum comentário, mensagem ou status real alterado. Desenvolvimento com fontes montadas, sem nova imagem Docker.

## Observações verificadas na revisão de plano

- V1 `SEND_DM completed` registra a preparação da etapa; o envio acontece depois. Exibir etapa concluída sem afirmar aceite/entrega e sem reconstruir mensagem usando os nós atuais. `COMPLETED` é conclusão do processamento; logs podem incluir condição ignorada ou gate esgotado.
- V2 usa `SENT` como aceite da Meta; entrega/leitura não são comprovadas. `UNKNOWN` no ledger prevalece sobre status final e seu filtro aplica essa regra no banco antes da paginação. Canceladas/ignoradas ficam no grupo Ignoradas ou canceladas; V1 aguardando postback fica em Aguardando interação.
- Leitores antigos não são reutilizados para autorização; o novo controller é registrado em authenticatedController e a nova consulta restringe simultaneamente organização/perfil/fluxo/versão/execução.

## Resultado da implementação e validação

- Componente comum aplicado aos históricos V1/V2, com tabela, filtros no servidor, paginação por cursor e drawer de detalhes. O modo Histórico preserva rascunhos e não oferece salvamento indireto.
- Frontend: 246 testes passaram em 34 arquivos (`tools/vitest.facebook-panel.config.mts`). Backend: 10 testes passaram em três arquivos de controller, service e repository. TypeScript e builds de frontend/backend passaram; `git diff --check` sem problemas. As 95 chaves `history_*` têm paridade pt/en.
- Revisões de plano, código, segurança, documentação e aceitação concluídas sem bloqueios. Nenhuma alteração em CLAUDE.md/AGENTS.md.
- Backup temporário das views e do backend compilado em `.secrets/ui-history-20261027/`. Backend recompilado e app local reiniciado; container saudável, sem nova imagem Docker, migração ou alteração nos executores.

### Browser Validation

Conferência no Chrome, somente no perfil Escorpiano, com registros existentes de Instagram, Facebook e Messenger. Confirmados: tabela comum, identificação do canal/gatilho, datas em pt-BR e fuso America/Sao_Paulo, filtro de falhas com estado vazio e restauração da lista, texto histórico V2, espera por interação V1, aceite da Meta sem promessa de entrega, fechamento por Escape/Voltar à lista e retorno de foco ao botão de detalhes. Sem erros/avisos de console nas telas V2 consultadas.

Nenhuma mensagem, comentário, gravação ou mudança de status feita durante a conferência. Capturas locais em `output/automation-history/`: `facebook-history.png`, `facebook-detail.png`, `instagram-detail.png` e `messenger-detail.png`. Os registros reais e os backups não integram a entrega versionada.
