# Messenger por palavra-chave

## Escopo aprovado em 26/10/2026

Adicionar ao criador Facebook o gatilho **Mensagem no Messenger**, reutilizando o editor rápido, canvas e execução V2. Instagram e comentários mantêm seu comportamento. Respostas de texto a Stories podem chegar como mensagens comuns, conforme a [prova de JSON completo](facebook-stories-validation.md); não há seleção de Story. QR Code e links de referência ficam fora deste incremento.

## Contrato implementado

- `/flows-v2` mantém CRUD e revisão otimista. O nó TRIGGER aceita `triggerType: messenger_message`, `keywords` (obrigatórias), `matchMode: any | all | exact` e `priority` inteiro de 1 a 1000. Menor número vence. Um canal Facebook, `postMode: all`, `postIds: []`; não representa vínculo a publicação. Configurações incompatíveis são recusadas no backend.
- `GET /flows-v2/channels/:id/readiness?triggerType=messenger_message` verifica autorização, callback e assinatura `messages` do aplicativo e da Página. Omissão mantém diagnóstico de comentários. `GET` não altera assinaturas. `POST /flows-v2/channels/:id/activate-messenger` acrescenta `messages` à Página selecionada somente por ação explícita, preservando campos existentes; exige que o aplicativo já tenha callback/`messages` configurados na Meta.
- Mensagens exigem HMAC dos bytes originais e conexão atual correspondente a organização, perfil, integração, aplicativo e Página. Texto de entrada, PSID, destinatário e ID opaco da mensagem são validados; ecos, exclusões, eventos de controle e mensagens sem texto não iniciam fluxos.
- Evento `messenger_message` persiste separadamente de `comment_on_post`; `externalPostId` vazio neste evento, sem inventar ID de publicação. Não há alteração de schema neste incremento.
- Somente envio privado ao PSID: `POST /PAGE_ID/messages`, `recipient.id`, `messaging_type: RESPONSE`. Janela conservadora de 24 horas a partir da mensagem de entrada, revalidada imediatamente antes do envio. Texto ou botão HTTPS; sem resposta pública. Etapas de DM contíguas compõem uma única resposta, como no editor V2 existente.

## Decisão única e isolamento

1. Ativação serializada pelo lock transacional da conta remota. Impedir regras idênticas (modo e conjunto normalizado de palavras), prioridade repetida e outra integração proprietária ativa para o mesmo gatilho/Página, inclusive em outro perfil/organização.
2. Ingestão usa o mesmo lock; reentrega do mesmo ID de mensagem/Página não reavalia definições novas. Selecionar apenas os fluxos de Messenger ativos no escopo, anteriores ao evento e cujo **gatilho** corresponde. A escolha acontece antes de avaliar condições; se a vencedora terminar sem ação, nenhuma outra assume a mensagem (`SKIPPED_CONDITION`). Menor prioridade vence; inconsistência de proprietário ou empate não envia.
3. Somente a vencedora cria despacho. As demais correspondências ficam como `SKIPPED_CONFLICT` no histórico, sem entrega. O snapshot interno registra o ID da vencedora; o painel mostra o motivo de conflito, sem exibir esse ID.
4. Reserva global por Página/ID de mensagem impede novo envio por concorrência, integrações duplicadas ou retomada do worker. Resultado HTTP incerto permanece `UNKNOWN`, sem reenvio automático.

## Interface e validação

Mesmo padrão visual do editor atual: escolha de gatilho, Página, palavras, prioridade, resposta e preview. Para Messenger, ocultar seleção de posts e resposta pública; ajuda curta explica alcance e prioridade. Canvas usa o mesmo contrato e limites. Erros de conflito no painel devem indicar a automação conflitante somente se pertencer ao mesmo perfil/organização. Histórico distingue envio de regra preterida.

TDD de parser/assinatura, validação de grafo, isolamento, conflitos, janela, envio e retomada. PostgreSQL isolado verifica ativações e webhooks concorrentes. Regressão cobre Instagram e comentários, seguida de validação do navegador e aplicação com `pnpm dev:local`, sem nova imagem Docker. Testes reais somente no Escorpiano e com mensagem específica de teste. A API pública/MCP legada não deve ser apresentada como compatível com V2 sem implementação e testes próprios.

Fontes Meta verificadas no navegador em 26/10/2026: [envio](https://developers.facebook.com/documentation/business-messaging/messenger-platform/send-messages) e [eventos de mensagem](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks/webhook-events/messages). O limite de 24 horas adotado aqui não implementa exceções de anúncios ou mensagens fora dessa janela.

## Estado

Implementação aplicada no ambiente local de desenvolvimento em 26/10/2026. Revisões de código e segurança encerradas sem achados pendentes. Prova real concluída somente no Escorpiano: uma resposta aceita pela Meta e recebimento único confirmado pelo usuário. A regra de menor precedência foi ignorada por conflito. As automações anteriores foram preservadas.

## Detalhes operacionais

- Regras repetidas usam a mesma normalização de correspondência: minúsculas, espaços nas pontas removidos e conjunto ordenado sem duplicações. `any`/`all` usam ocorrência no texto; `exact` exige a mensagem inteira igual a uma palavra/frase. Acentos são preservados.
- Prioridade escolhe uma automação por mensagem, não uma por conversa. Uma nova mensagem com outro `mid` pode executar novamente. Os comentários continuam com as regras anteriores.
- Ingestão sem correspondência guarda somente os identificadores necessários para não reavaliar uma reentrega após edição: texto e autor ficam vazios. Execuções ignoradas também não duplicam texto/autor no snapshot. A vencedora guarda os dados necessários à execução/histórico V2. Não é captura de JSON bruto.
- A consulta de deduplicação global é feita sob lock por Página; o schema atual não tem índice composto para essa consulta. Não há migração neste incremento. Antes de volume elevado, medir a consulta e incluir o índice pelo fluxo de migrações do produto.
- Alterações de assinatura são serializadas em Redis por aplicativo/Página, inclusive entre perfis e workers. Concorrência retorna `SUBSCRIPTION_UPDATE_BUSY`; uma nova tentativa explícita relê os campos. Uma resposta HTTP incerta ou alteração não confirmada pela leitura posterior retém o bloqueio temporário por até dois minutos.
- O lease é conferido antes do POST, com margem de 30 segundos para transporte (15 s) e confirmação (15 s). Não existe retry automático de mutação remota.
- Tokens de Página do Messenger exigem `pages_messaging` e `pages_manage_metadata` neste diagnóstico; as exigências existentes para autorização de comentários/usuário de sistema permanecem.
- A API autenticada `/flows-v2` recebe este contrato; a API pública `/public/v1/flows` e o MCP continuam no motor Instagram legado e **não oferecem Messenger neste incremento**.


## Evidências de validação — 26/10/2026

- Regressão backend: **636 testes aprovados**, 39 suítes. Os 18 casos de infraestrutura foram executados separadamente: **12 aprovados com PostgreSQL isolado** e **6 com Redis real**, incluindo disputa simultânea de prioridade, reentrega, bloqueio global e assinatura concorrente da Página.
- Interface: **148 testes aprovados** em 19 arquivos; após a revisão visual dos textos, os **15 testes do criador** passaram novamente. TypeScript do frontend e builds backend/orchestrator aprovados; worker/replay: **13 testes aprovados**.
- O teste de assinatura remota sem confirmação primeiro falhou; a correção mantém o lock até o TTL quando o GET não confirma o POST. Suíte focal: **63 testes aprovados**; regressão completa repetida e aprovada depois.
- `git diff --check` aprovado. O repositório não oferece o script `pnpm lint` neste checkout; não foi registrado como validação aprovada.
- `pnpm dev:local` atualizou backend/worker e montou o frontend em desenvolvimento. Container saudável; imagem preservada (`de4e3f969a83…`), sem construir imagem nova.
- Navegador autenticado no Escorpiano: criar/salvar Messenger, trocar editor rápido/visual preservando palavras e prioridade, ausência de posts/resposta pública, prontidão da conexão e ativação confirmadas.
- Console do navegador sem erros capturados; avisos de Fast Refresh por recarregamento completo durante a atualização de código, sem falha funcional observada.
- A tentativa de ativar a segunda regra com prioridade 10 foi recusada, com aviso legível identificando **Teste Messenger — prioridade 10**. Após salvar prioridade 20, a ativação foi aceita.
- Fluxos locais de prova: `7e1fc434-8ff2-4905-aeae-78984cb8fca2` (prioridade 10, contém `teste messenger multipost m2610`) e `9a66de5a-2003-4eae-aa7d-ecafa1c96ab8` (prioridade 20, contém `multipost m2610`), ambos somente na Página `271852286004401`. Uma mensagem **Teste Messenger MultiPost m2610** deve corresponder aos dois e produzir somente a resposta da prioridade 10; a prioridade 20 deve registrar `SKIPPED_CONFLICT`.
- **Prova real concluída às 17:23 de 26/10/2026 (America/Sao_Paulo):** mensagem recebida às 17:23:45; um único evento `messenger_message`, um único despacho. Prioridade 10: execução `c9bcb145-0c62-4297-b982-7d97f8c8ebdd`, `COMPLETED` às 17:23:53, entrega `messenger_reply` em `SENT`, com identificador remoto confirmado pela Meta. Prioridade 20: execução `a0274144-1a1e-47e9-bca3-166eb801076d`, `SKIPPED_CONFLICT` / `MESSENGER_HIGHER_PRIORITY`, sem entrega. O usuário confirmou ter recebido **somente uma resposta com o link**. Nenhuma outra Página participou da prova.

- Após a confirmação do usuário, as duas regras de prova foram pausadas pelo painel. Os históricos continuam disponíveis: envio aceito na prioridade 10 e conflito sem envio na prioridade 20. Nenhuma alteração de código foi necessária nesta homologação; não houve novo build ou imagem Docker.
