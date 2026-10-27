# Conexão Meta: comparação Instagram/Facebook e próxima prova

Atualização posterior: em 22/10/2026 às 16:15:43, a prova pelo painel enviou a mensagem aprovada e recebeu `message_id` da Meta, estado `SENT` persistido. O usuário confirmou em 22/10/2026: “Sim, recebi a mensagem com o link”. O recebimento no Messenger está confirmado para este teste pelo painel; isso não conclui a implementação do motor automático. A análise abaixo é o registro anterior ao envio; ver [resultado e operação](../operations/facebook-automation-panel.md#6-prova-de-resposta-privada-pelo-painel--somente-escorpiano).


Inspeção de 22/10/2026. Contexto: autorização pelo painel e comentário real recebido da Página Escorpião Veneno. Esta nota registra análise e próximos incrementos; não declara o motor compartilhado entregue.

## Evidência da homologação Facebook

- Organização `12792a7b-75da-45cb-a11d-9f980aeb5df2`, perfil Escorpiano `0818f364-7b29-49af-87f6-9220ad2b3db9`, integração `cmvi6us6q0005pm090b98kalb`.
- App `841571281566716`, Página `271852286004401`.
- Status lido da chave exata no Redis: `RECEIVING_READY`, `missingPermissions: []`, `automaticRepliesAvailable: false`, verificado em `2026-10-22T18:26:51.385Z`.
- Recibo lido da chave exata no Redis: `receivedAt=2026-10-22T18:26:51.568Z`, post `271852286004401_122321127302221279`, comentário `122321127302221279_1740025530415851`.
- Horário local: 15:26:51 em America/Sao_Paulo. Os dois registros concordam com os prints do usuário.
- `FacebookAutomationSetupService.receive` valida a assinatura e resolve a Página/integração/perfil antes de gravar o recibo. Não chama o motor Temporal nem envia mensagem. O corpo, assinatura, texto e autor não são guardados.

Assim, o caminho **comentário → Meta → webhook → Página/perfil corretos no MultiPost** está comprovado para esse evento. Falta comprovar **MultiPost → resposta privada no Messenger** e integrar a execução automática ao editor. Um evento real não comprova outros tipos de post, repetição ou limites de envio.

O botão de ativação verifica configuração/inscrição. Não é necessário apertá-lo depois de cada comentário e ele não é um botão de execução de automação.

## Por que os procedimentos de token parecem diferentes

| Caminho | Código existente | Token e consequência |
|---|---|---|
| Facebook — novo onboarding de automação | `facebook-automation-setup.service.ts`, `FacebookProvider` em modo opt-in | OAuth obtém a autorização e o Page token da Página selecionada; persistência cifrada separada da publicação. Não exige copiar access token. |
| Instagram — conta conectada por Facebook Login com token manual de messaging | `instagram.provider.ts`, `instagram-messaging.service.ts`, `Credentials.instagramTokens` | Publicação pode usar Page token; o token Instagram cadastrado por conta é preferido nas operações de automação por `resolveIgRoute`. É o procedimento relatado pelo usuário. |
| Instagram — login direto | `instagram.standalone.provider.ts` | Já implementa URL OAuth, troca de código, token de longa duração e renovação. Solicita também permissões de comentários e mensagens. `resolveIgRoute` usa o token da própria integração em `graph.instagram.com`. |
| Instagram pelo ecossistema Messenger/Facebook Login | `instagram.provider.ts` e fallback de `resolveIgRoute` | Usa Page token e conta profissional vinculada à Página. O caso de uso Messenger inclui ferramentas Instagram, mas as permissões, ativos e assinaturas precisam ser próprios dessa integração. Configurar `feed` do Facebook não habilita comentários/DMs do Instagram. |

A obrigação de copiar um token não é inerente ao Instagram: o produto já possui uma alternativa OAuth. A mudança da experiência precisa preservar conexões existentes e validar as permissões no aplicativo real, especialmente comentários, mensagens, stories e follow-gate. Não generalizar as notas históricas de Standard/Advanced Access para prometer ausência de App Review em qualquer instalação ou conta de aluno.

## Oportunidades concretas encontradas

1. **Uniformizar a jornada de conexão**, mantendo adaptadores e tokens distintos: selecionar conta, autorizar por login, verificar webhooks e mostrar estado operacional.
2. **Completar a compatibilidade do login direto Instagram na interface.** `automation-wizard.component.tsx`, `story-wizard.component.tsx` e `nova-automacao-modal.component.tsx` filtram `identifier === 'instagram'`. `/integrations/list` devolve `providerIdentifier` sem normalização, e `useIntegrationList` preserva esse valor. Portanto, o provider `instagram-standalone` existente não basta para garantir a mesma experiência nesses assistentes. O Inbox já aceita os dois identificadores. Verificar também seleção de posts e roundtrip dos flows antes de corrigir o filtro de forma isolada.
3. **Não migrar o Instagram atual durante a prova Facebook.** Manter `resolveIgRoute`, tokens cadastrados e callbacks existentes. Tratar simplificação do onboarding como incremento próprio com regressões, preservando o plano principal de uma automação com destinos por canal.

Esta inspeção não alterou contas, tokens, webhooks nem código de Instagram.

## Próximo passo da prova de envio

O usuário escolheu o próprio post como link para a mensagem de teste:

> Teste do MultiPost: seu comentário chegou. Aqui está o link: https://www.facebook.com/share/p/1DsHnUeoAy/

Destino previsto: resposta privada ao autor do comentário `122321127302221279_1740025530415851`, enviada pela Página Escorpião Veneno. Nenhuma resposta foi enviada nesta inspeção.

Preparar a prova na jornada do painel, reaproveitando a autorização já armazenada. Antes de enviar, revalidar acesso/permissões, comentário, Página e elegibilidade temporal; reservar o envio de modo durável para impedir duplicação; apresentar conteúdo/destino e resultado sanitizado. Não exigir novo token manual dos alunos. O adaptador `FacebookCommentAutomationAdapter.sendPrivateReply` já prepara `recipient.comment_id`, mas está isolado do produto e ainda não tem comprovação de entrega real nesta instalação.

O CLI antigo exige corpo bruto e assinatura reais. O recibo reduzido não atende a esse contrato; não fabricar um payload nem assinatura para fazê-lo passar. A jornada do painel precisa ter contrato próprio para a prova, usando o recibo confiável e a validação remota, ou incorporar captura apropriada de um novo evento conforme o plano de prova.

Depois da comprovação de envio e dos demais critérios da etapa 0: implementar persistência/despacho/execução V2 e editor compartilhado; permitir selecionar Facebook, posts, palavras-chave e mensagem/link; testar ponta a ponta e preservar Instagram. A área **Criar automação** ainda não oferece essa funcionalidade Facebook.

## Fontes verificadas

- Código local citado acima e [plano compartilhado aprovado](facebook-instagram-shared-automations.md).
- Coleção oficial Meta: [Instagram Login](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login), que documenta conta profissional sem exigir Página vinculada e permissões `instagram_business_*`.
- Coleção oficial Meta: [Facebook Login para Instagram](https://www.postman.com/meta/instagram/folder/9cgqucg/instagram-api-with-facebook-login), que documenta o vínculo com Página.
- Coleção oficial Meta: [Messenger Platform](https://www.postman.com/meta/messenger-platform-api/collection/iyp204x/messenger-platform-api) e [Conversations API](https://www.postman.com/meta/messenger-platform-api/folder/22794852-255610cd-47f5-4f4d-b3fa-71aec360be9a), que distinguem Messenger/Instagram e suas permissões.

As páginas `developers.facebook.com` de overview e Private Replies retornaram HTTP 429 nesta inspeção; a comparação usa o código atual e os resultados públicos das coleções oficiais Meta no Postman. Não houve revalidação ao vivo de concessões Instagram nem envio pela API.
