# Execução do criador compartilhado — 22/10/2026

Complementa o plano aprovado `facebook-instagram-shared-automations.md`. A prova privada pelo painel foi recebida pelo usuário. Este incremento implementa a opção 2: uma definição e até dois destinos (um Instagram e um Facebook), cada qual com seus posts. Automações antigas continuam no motor V1.

## Contrato e limites

- API autenticada `/flows-v2`: lista/criação, `/:id` leitura/edição/exclusão, `/:id/status`, `/:id/executions`; `/channels` e `/channels/:id/posts`/`readiness`. Contexto obrigatório de organização e perfil. Revisão esperada em toda alteração. V1 não edita V2.
- Definição canônica reutiliza os tipos de nós e arestas existentes: comentário, palavras-chave, condição, espera, resposta pública e uma resposta privada agregada. Stories, follow-gate e postback permanecem no Instagram legado; não são convertidos silenciosamente.
- Post específico, todos ou próxima publicação, por destino. A próxima publicação externa é vinculada ao primeiro comentário elegível observado; uma publicação feita pelo MultiPost pode vinculá-la antes.
- Configuração compartilhada aceita somente capacidades comuns e valida o limite final após interpolar variáveis. Uma mensagem com link em texto é a configuração inicial recomendada.
- Reutiliza o callback Facebook já cadastrado (`/public/facebook-automations/:appId`). A inscrição continua individual por Página; nenhuma inscrição em massa.

## Persistência e entrega

DDL aditivo: versão/revisão/definição no Flow; FlowChannel; AutomationEvent; AutomationDispatch; FlowExecutionV2 e FlowDelivery. O campo legado integrationId é apenas uma âncora estrutural no V2: destinatários vêm exclusivamente do canal persistido. Definição JSON canônica e snapshot ficam limitados e sem credenciais.

O webhook confirmado grava evento e despacho em transação antes do ACK. O despacho usa workflow ID determinístico; reconciliação recupera falhas entre commit e Temporal. Reentregas não criam novas execuções. O workflow lê o snapshot e atividades resolvem credenciais vigentes fora do histórico Temporal.

Reserva durável de efeito privado por plataforma + conta remota + comentário, inclusive entre integrações/perfis e flows V2. Resultado incerto não é reenviado automaticamente. Para convivência com V1, ativações de comentários V1/V2 na mesma conta são mutuamente exclusivas sob lock transacional; Stories legados não precisam dessa exclusão. Execuções legadas ainda em andamento também bloqueiam ativação V2.

Pausar/excluir impede novos efeitos; editar exige rascunho/pausa. Mudanças de revisão invalidam despachos antigos ainda não enviados. O ledger nunca é removido ao excluir uma automação.

## Simplificação e tokens

O usuário escolhe os canais, seleciona posts e escreve a resposta uma vez. Autorização pendente leva diretamente à configuração daquela Página. Webhook do aplicativo é configurado uma vez; depois basta autorizar/ativar cada Página no MultiPost.

Exibir validade do token e do acesso aos dados, última verificação e reautorização quando necessária. Valor zero da Meta significa sem vencimento programado informado, não credencial permanente. O token de automação é separado do token de publicação; o cron antigo não o renova. Não ativar renovação global nem alterar outras contas como parte do teste local. Diagnóstico e pré-envio verificam autorização atual.

## Validação e ativação

1. Testes RED→GREEN de contrato/grafo, revisão, isolamento, deduplicação, reserva de efeito e erros incertos.
2. Testes dos adaptadores com HTTP simulado, sem chamar contas reais.
3. Regressão do Instagram, builds e testes de interface.
4. Backup do banco Docker recuperado; aplicar somente DDL aditivo, gerar cliente Linux e atualizar backend/worker juntos. Habilitação explícita apenas após worker compatível.
5. Navegador: criar automação limitada ao post de teste do Escorpião Veneno (Página 271852286004401). Novo comentário real necessário: a prova anterior já consumiu sua resposta privada.
6. Teste real somente nessa Página. Demais canais: exclusivamente testes automatizados. Rollback: desativar V2, pausar seus workflows, voltar binário compatível; não remover tabelas/ledgers nem habilitar V1 sobre efeitos pendentes.

Estado em 22/10/2026: implementação instalada no Docker local, com bloqueio de teste exclusivo Escorpiano. Regressão 488 testes, PostgreSQL isolado 5, interface/datas 13 e workflow 3 aprovados; um caso adicional de validade do token passou na suíte focal de 34 testes. Backend/orchestrator compilados e TypeScript frontend aprovado. Backup privado pre-shared-creator-20261022.dump preservado; migração aplicada em transação. Dispatcher real completou atividades no Temporal. Automação `c653c56a-3426-41d2-8ce5-29b3cb86df47` criada e ativada pelo painel, revisão 2, somente no post Facebook de teste. Navegador confirmou seleção exclusiva do Facebook, mensagem aprovada, estado ativo e validade em pt-BR. Calendário e configurações também renderizados após o ajuste local para Turbopack. Prova automática V2 executada com comentário novo do usuário: evento recebido às 18:03:23, execução COMPLETED e entrega privada SENT às 18:03:27, com workflow Temporal concluído e resultado exibido no histórico. O usuário confirmou em 22/10/2026 o recebimento da nova mensagem com o link no Messenger, concluindo a prova automática de ponta a ponta. Não reutilizar os comentários já respondidos. API pública V2, SDK/CLI, conversão explícita de legado e liberação geral continuam sujeitos aos testes de contrato e ao gate de rollout do plano principal; não inferir entrega a partir deste documento.
