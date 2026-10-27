# Stories do Facebook — validação do gatilho

Data: 26/10/2026. Solicitado após as variações de respostas públicas. **Recebimento confirmado; comparação limitada ao resumo filtrado. Na primeira rodada, os JSONs completos não foram armazenados, portanto a ausência de um discriminador de Story ainda não está comprovada. Automação de Stories do Facebook não habilitada.**

> Revisão da evidência: `facebook-messenger-probe.ts` preserva apenas nomes de campos conhecidos dentro de cada evento `entry.messaging`, seus tipos e alguns indicadores. Um eventual `is_story` não está na lista permitida; campos no nível de `entry` e do envelope externo também não são resumidos. As tabelas abaixo comparam observações sanitizadas, não os JSONs originais completos. Essa limitação precisa ser resolvida antes de encerrar a investigação de origem.

## Evidência e limite atual

- No Instagram original, o sistema já distingue respostas a Stories. Esse contrato não comprova o comportamento do Facebook.
- A [referência oficial de `messages`](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks/webhook-events/messages), consultada no navegador em 26/10/2026 (atualização da página em 16/09/2026), descreve `reply_to.mid` e `is_self_reply`, anexos e referências de anúncios. Não documenta nessa referência um identificador `reply_to.story` para o Messenger do Facebook. Essa ausência não prova que a Meta nunca envie contexto de Story; exige teste real.
- A [Send API oficial da Meta](https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api) descreve respostas por PSID a mensagens recebidas, com a janela padrão de 24 horas. Não confundir esse envio com a resposta privada a um comentário de feed.
- O callback de comentários usava `entry.changes` e rejeitava entradas contendo apenas `entry.messaging`. A preparação aceita esse envelope como evento ignorado pelo motor de comentários; `changes` presente e inválido continua sendo rejeitado.

## Primeiro incremento

Preparar diagnóstico local temporário no callback existente, antes de liberar o gatilho no criador. Nenhuma nova rota pública, mudança de callback, migração, resposta automática ou alteração de fluxo existente.

Contrato do modo estrutural: selecionar explicitamente uma integração para observação, com prazo máximo de 24 horas. Somente conexões atuais com assinatura HMAC válida, Página, organização e perfil correspondentes poderão gerar observações. Armazenar por curto período apenas estrutura/tipos de campos e indicadores sanitizados, nunca texto da mensagem, nome, PSID, URL de mídia, token ou corpo bruto. Limitar quantidade e tamanho dos registros. Mensagens observadas não entram no motor de automações.

O parser deve continuar processando comentários válidos em lotes mistos e ignorar eventos Messenger na lógica de comentários. Uma mensagem comum não pode acionar automação de Story.

## Prova necessária no Escorpiano

1. Confirmar `messages` na assinatura do aplicativo e somente na Página de teste, preservando `feed` e campos existentes. A configuração do aplicativo é compartilhada; não trocar o callback.
2. Publicar um Story de teste na Página Escorpião Veneno e responder com texto usando outra conta.
3. Enviar uma DM comum como controle e responder a uma mensagem existente na conversa. `reply_to.mid` sozinho não prova origem em Story. Testar uma reação ao Story separadamente.
4. Comparar os eventos: identificar se há metadados confiáveis de origem e ID do Story; distinguir recebido de identificado e de respondido.
5. Somente após evidência definir `story_reply`, seleção de Stories, palavras-chave, deduplicação por mensagem, resposta por PSID e janela de envio. Se faltar origem confiável, apresentar a limitação e avaliar um gatilho genérico de mensagem; não rotulá-lo como Stories.

## Testes e revisão

Assinatura inválida, Página/perfil/integração diferentes, opt-in ausente/expirado, ausência de `changes` em mensagem legítima, lote misto, eco e eventos de status, estrutura limitada sem valores sensíveis, quota/TTL, falha do diagnóstico sem interromper comentários e regressão Instagram/Facebook. Sem envio real nesta preparação.


A implementação inclui testes do parser, serviço e repositório, com assinatura inválida, escopos divergentes, captura desligada/expirada, falha isolada e ausência de conteúdo sensível. O diagnóstico contempla também campos de referência no envelope externo a `message`, com nomes de campos desconhecidos omitidos. O prazo absoluto é reconferido atomicamente pelo relógio do Redis no momento de gravar. Três testes com Redis real cobrem concorrência, desarme e expiração entre leitura e gravação.

## Modo estrutural — operação local temporária

Esta ferramenta serve à investigação; não é uma nova etapa de configuração para os alunos. O gatilho de Stories, sua interface, API/MCP e o envio de mensagens continuam pendentes da prova de origem.

1. Aplicar os fontes com `pnpm dev:local`, sem construir outra imagem.
2. Confirmar as assinaturas de `messages` no aplicativo e na Página alvo. A ferramenta abaixo **não altera inscrições na Meta**.
3. Criar um arquivo local ignorado pelo Git, com permissão 600, contendo somente `organizationId`, `profileId`, `integrationId`, `appId` e `pageId`. Os cinco identificadores devem corresponder à mesma conexão Facebook autorizada; não incluir tokens.
4. Armar a captura por 60 minutos, ler os resultados e desarmar ao concluir:

```bash
node tools/facebook-messenger-probe-local.mjs arm .secrets/facebook-stories-probe/scope.json 60
node tools/facebook-messenger-probe-local.mjs read .secrets/facebook-stories-probe/scope.json
node tools/facebook-messenger-probe-local.mjs stop .secrets/facebook-stories-probe/scope.json
```

O helper exige socket Unix de Docker e o container local deste projeto. Confere integração ativa, perfil e registro de autorização antes de acessar somente as chaves de diagnóstico correspondentes. Não decifra credenciais, chama a Meta, envia mensagens nem altera automações. Sem armação explícita, não há coleta.

Cada escopo retém no máximo 20 observações, por 24 horas a partir da primeira; o prazo não é renovado por novas mensagens. O opt-in aceita de 1 a 1.440 minutos, expira automaticamente e uma segunda execução de `arm` não prolonga a janela existente. `stop` interrompe a coleta; os registros sanitizados ainda expiram no prazo original. Rearmar o mesmo escopo não apaga a quota nem os registros anteriores: aguardar a expiração se atingir o limite.

No modo estrutural, os registros contêm horário, hash do identificador de mensagem, tipos de anexos reconhecidos e estrutura/tipos de campos. Não armazenam texto, PSID, nomes, URLs, tokens, corpo bruto nem valores identificadores de Story. O diagnóstico permite verificar a existência da estrutura reconhecida, sem comprovar ausência de campos desconhecidos ou que um eventual campo seja estável para produção.

Teste Redis opt-in, sem acessar inscrições ou disparar automações:

```bash
docker exec -e MESSENGER_PROBE_REDIS_TEST=true multipost-facebook-local-app-1 pnpm exec jest --selectProjects nestjs-libraries --runInBand --coverage=false --testPathPattern=facebook-messenger-probe.redis.spec
```

## Verificação local — 26/10/2026

Backend e worker compilados e reiniciados com `pnpm dev:local`; container saudável, sem reinícios e usando a mesma imagem `multipost-facebook-local:source`. Nenhuma migração ou nova imagem.

Consulta real somente leitura confirmou, para o app `841571281566716`, callback Page ativo na URL do MultiPost, mas somente `feed` assinado. A Página Escorpião Veneno (`271852286004401`) também tem somente `feed` na inscrição desse aplicativo. Portanto, a captura ainda não está pronta para respostas de Story. Foi solicitado ao usuário ativar `messages` no aplicativo, mantendo `feed` e o callback; depois será necessário confirmar/adicionar `messages` somente na inscrição da Página de teste, preservando os demais campos.

A captura permanece desarmada e sem registros. O usuário vai publicar um Story. Recebimento de resposta ao Story, distinção de DM comum e resposta a uma mensagem existente ainda não confirmados. Não alterar inscrições de outras Páginas.

Revisões de plano, código, segurança e documentação concluídas. A revisão apontou e foram corrigidos: inspeção dos metadados externos a `message` e conferência do prazo absoluto pelo Redis ao gravar. Os testes focais passaram (105), além dos três testes Redis reais. O helper recusou prazo acima de 24 horas e Docker remoto; `--help` e leitura local funcionaram.

Validação final: `pnpm test:automations:regression` concluiu com 592 testes aprovados, nove ignorados e 36 suítes aprovadas. Três dos ignorados pertencem à prova Redis opt-in, executada separadamente com sucesso (3/3). Localhost e domínio do túnel responderam HTTP 200 em `/auth`. `git diff --check` sem erros.


### Conferência após a confirmação do usuário — 26/10/2026, 13h09 (São Paulo)

O usuário informou ter ativado `messages`. Duas consultas somente leitura à API ainda retornaram exclusivamente `feed` na assinatura Page do aplicativo; a inscrição da Página também seguia com `feed`. A identidade do token foi conferida e corresponde à Página `271852286004401`.

A aba existente no Chrome estava em **API do Instagram**, com `messages` assinado. Navegação somente para inspeção abriu **Messenger from Meta → Configurações da API do Messenger → 1. Configure webhooks**: a linha `messages` aparecia desassinada, enquanto `feed` estava assinado. A tela ficou posicionada no campo correto para o usuário ativar. Essa evidência explica a divergência de contextos, mas não permite afirmar em qual tela o usuário fez a ação anterior.

Nenhuma assinatura foi alterada pelo agente; a captura permanece desarmada. Aguardando ativação no Messenger para conferir novamente e preparar somente Escorpião Veneno.


### Ativação autorizada pelo navegador — 26/10/2026, 13h21 (São Paulo)

Após o pedido explícito “Ative pra mim pelo navegador”, foi ativada somente a linha `messages` no webhook Messenger do aplicativo atual. Em seguida, na seção **2. Gere tokens de acesso**, a inscrição existente da Página **Escorpião Veneno / 271852286004401** foi editada: `feed` permaneceu marcado e `messages` foi acrescentado. O painel confirmou **feed e messages** após salvar. Nenhum token foi gerado, callback trocado ou outra Página editada.

A leitura independente da Graph API às 16:21:47 UTC confirmou aplicativo Page ativo com `feed` e `messages`, callback esperado e a mesma dupla de campos na inscrição da Página. A captura local foi armada por 60 minutos para o escopo autorizado (organização, perfil Escorpiano, integração `cmvi6us6q0005pm090b98kalb`, app e Página), com expiração às **14:21:53 de São Paulo**. Leitura após armar: ativa, sem registros. A expiração desliga apenas o diagnóstico temporário; não remove a assinatura na Meta.

Foi solicitado responder ao Story com outra conta, usando o texto “Teste Story MultiPost” pela caixa de resposta do próprio Story. A prova de recebimento continua pendente; nenhuma mensagem foi enviada pelo MultiPost nesta etapa. Depois da resposta, comparar DM comum e resposta a mensagem existente antes de concluir que o evento identifica Stories.


### Primeiro evento após resposta ao Story — 26/10/2026, 13h52 (São Paulo)

Após o usuário confirmar que respondeu ao Story com outra conta, a captura continha **um evento recebido às 13:52:47.230** (16:52:47.230 UTC), pertencente ao escopo autorizado do Escorpiano. A assinatura foi aceita pelo callback. O registro indica mensagem de entrada com texto, sem eco, sem `is_unsupported`, sem anexos e sem truncamento.

Estrutura sanitizada observada: `message` (objeto), `message.mid` (string), `message.text` (string). Não aparecem `reply_to`, `story`, `story_id` ou `referral` entre os campos reconhecidos. Há três nomes de campos omitidos pelo sanitizador; o corpo bruto, o texto e o ID de remetente não são armazenados. Não inferir uma classificação automática de Story apenas da confirmação humana e do horário.

Foi solicitado um controle usando a mesma conta: enviar “Teste DM MultiPost” diretamente pela conversa no Messenger, sem entrar pelo Story. A captura segue ativa até o prazo original; comparação com DM comum e resposta a mensagem existente ainda pendentes. Não houve envio automático, ativação de novo gatilho nem alteração de código nesta conferência.


### Janela expirada antes da comparação — 26/10/2026, 14h37 (São Paulo)

Após a confirmação do usuário de envio da DM comum, a leitura do diagnóstico retornou captura inativa e somente o primeiro evento (13:52:47). O opt-in anterior expirou às 14:21:53. Não há registro da DM para comparação; não concluir que ela não foi entregue à Página nem que o payload seria igual ao do Story.

O container estava saudável, sem reinícios. A captura foi rearmada às 14:37:02 por 120 minutos, com término às **16:37:02 de São Paulo**, mantendo exatamente o mesmo escopo e o primeiro registro. Foi solicitado reenviar somente a DM comum, pela mesma conta e diretamente na conversa. Nenhuma nova inscrição na Meta, mensagem enviada ou mudança de código; o controle por resposta a uma mensagem existente também continua pendente.


### Comparação com DM comum — 26/10/2026, 14h45 (São Paulo)

O reenvio informado pelo usuário gerou um segundo registro às **14:45:55.500** (17:45:55.500 UTC). A captura estava ativa. Comparação dos registros sanitizados:

| Indicador | Resposta ao Story informada pelo usuário | DM comum informada pelo usuário |
| --- | --- | --- |
| Recebimento local | 13:52:47.230 | 14:45:55.500 |
| Texto presente | Sim | Sim |
| Eco / não suportada | Não / Não | Não / Não |
| Anexos | Nenhum | Nenhum |
| Campos reconhecidos | `message`, `message.mid`, `message.text` | `message`, `message.mid`, `message.text` |
| Campos não reconhecidos omitidos | 3 | 3 |
| Truncamento | Não | Não |

Hashes de mensagem distintos confirmam que são dois registros diferentes. A correlação com cada ação depende da confirmação do usuário e da sequência temporal, porque o diagnóstico não guarda texto ou identidade de remetente. Nos campos observados, não há diferença que permita classificar com segurança uma resposta como originada em Story. Isso não prova ausência de suporte em todos os clientes/cenários da Meta; impede liberar agora um gatilho exclusivo de Stories baseado nesses eventos.

Foi solicitado o último controle: usar **Responder** em uma mensagem antiga recebida do MultiPost, na mesma conversa, com “Teste resposta DM”. Objetivo: verificar como uma resposta dentro da conversa é representada, sem confundir eventual `reply_to.mid` com ID de Story. Nenhuma resposta automática enviada e nenhum gatilho exposto.


### Conclusão da prova de texto — 26/10/2026, 14h55 (São Paulo)

O terceiro evento chegou às **14:55:23.827** (17:55:23.827 UTC), após o usuário confirmar que utilizou **Responder** em uma mensagem antiga do MultiPost. Ele contém os campos anteriores e, adicionalmente, `message.reply_to` (objeto) e `message.reply_to.mid` (string). É uma mensagem de entrada com texto, sem eco, sem anexos, sem sinal de não suportada e sem truncamento. O hash é diferente dos dois registros anteriores.

Resultado observado:

| Ação informada pelo usuário | Estrutura adicional identificável |
| --- | --- |
| Responder com texto ao Story Facebook da Página | Nenhuma; `message.mid` e `message.text` |
| Enviar texto diretamente na conversa Messenger | Nenhuma; `message.mid` e `message.text` |
| Responder a uma mensagem antiga na conversa | `message.reply_to.mid` |

O último controle confirma que o diagnóstico captura `reply_to` quando a Meta o envia. Esse campo identifica uma resposta dentro da conversa e, isoladamente, não comprova origem em Story. A referência de mensagem não apareceu na prova de Story.

**Decisão técnica deste incremento:** não liberar gatilho exclusivo de Stories nem seleção por Story com base nesses eventos. Uma regra que apenas procure mensagem de texto trataria também DMs comuns. A conclusão é limitada a esses testes de texto, nessa Página e no cliente utilizado pelo usuário; não afirmar que toda a plataforma Meta seja incapaz de fornecer contexto em qualquer cenário. Reações, outros clientes e outros cenários não foram homologados nesta prova.

**Alternativa de produto proposta, ainda não implementada:** gatilho **Mensagem no Messenger** por palavra-chave, aplicável a mensagens recebidas independentemente de terem sido escritas no Story ou na conversa. O produto precisa explicitar esse alcance. Resposta por PSID, janela de envio, deduplicação, isolamento, consentimento, testes e contratos API/MCP exigem um incremento próprio; os testes de recebimento não comprovam o envio dessa nova modalidade. A decisão de seguir por esse caminho fica com o usuário.

A captura temporária foi desarmada após a comparação; leitura confirmou `active: false` com os três registros sanitizados preservados até o TTL original (27/10/2026 às 13:52:47 de São Paulo). O desligamento do diagnóstico não removeu as assinaturas `feed`/`messages` na Meta. Nenhuma mensagem enviada, novo gatilho, alteração de automações, Instagram ou outra Página. Não são necessários novos testes humanos para fechar esta prova inicial.

### Revisão do JSON e dos gatilhos Messenger — 26/10/2026

O usuário pediu procurar um possível `is_story` e avaliar os gatilhos dos prints do Manychat antes de decidir a continuação. A leitura local reconfirmou captura desarmada e os mesmos três registros. A inspeção do sanitizador revelou uma limitação que restringe a conclusão anterior:

- `FIELD_NAMES` é uma lista de nomes permitidos. `is_story` não pertence a ela. Chaves desconhecidas são contadas, mas seus nomes, valores e subárvores são descartados.
- O resumo percorre apenas cada objeto `entry.messaging[]`. Metadados adicionais de `entry` e do objeto externo não são preservados.
- Campos primitivos reconhecidos normalmente guardam o tipo, não o valor. Igualdade de estrutura não implica igualdade de flags ou enumerações. `isEcho`, `isUnsupported` e tipos de anexos são indicadores tratados separadamente.
- Os três registros indicam três campos omitidos cada. Não é possível recuperar seus nomes dos resumos. A semelhança com um envelope comum não substitui a evidência dos nomes originais.
- O controller entrega `req.rawBody` ao serviço para validação, mas o diagnóstico não o armazena. O access log do Nginx registra método, URI e status, não o corpo. Portanto não há JSON original recuperável nos registros desta prova.

**Correção da conclusão:** recebimento está comprovado; igualdade dos JSONs completos e ausência de discriminador de Story não estão. A confirmação humana e o horário correlacionam cada teste, sem comprovar automaticamente a origem. `reply_to.mid` foi observado também numa resposta de conversa e não serve sozinho para identificar Stories.

Para resolver a lacuna será necessário um novo teste controlado, precedido por diagnóstico que examine o envelope completo, incluindo campos desconhecidos e valores relevantes de flags, com escopo e retenção restritos e ocultação de conteúdo pessoal. Não basta acrescentar apenas `is_story` à lista e concluir que todos os outros campos são iguais. A ampliação e a repetição dos testes ainda não foram executadas nesta revisão. A captura continua desligada.

#### Recursos dos prints e situação do MultiPost

| Recurso | Evidência / situação | Encaminhamento proposto |
| --- | --- | --- |
| Comentário em publicação específica + palavra-chave | Implementado no Facebook V2 | Manter; ampliar os formatos e vínculos de publicação em incrementos próprios |
| Resposta pública e variações | Implementadas no Facebook | Reaproveitar a configuração existente |
| Somente comentários de primeiro nível | O parser exige `parent_id === post_id` | Hoje é comportamento fixo; oferecer respostas a comentários exigiria outro contrato e testes |
| Mensagem no Messenger por palavra-chave | `messages` é recebido para diagnóstico, sem iniciar fluxos | Novo gatilho com decisão única por evento, deduplicação e janela de envio |
| Link de referência | Meta documenta `referral.ref` e `source: SHORTLINK`; ainda não há gatilho no MultiPost | Boa opção para separar campanhas por link |
| Código QR | Pode ser oferecido no MultiPost como representação do link de campanha | Reaproveitar o futuro roteamento por referência |
| Clique em anúncio que abre Messenger | Meta documenta contexto `ADS`/`ad_id` | Incremento posterior; distinto de comentários em dark posts |
| Mensagem da Loja Facebook | A referência de mensagens inclui contexto de produto de Shops | Baixa prioridade até existir caso de uso e ativo elegível para homologação |
| Resposta a Story Facebook | Origem não homologada | Manter indisponível enquanto a comparação completa estiver pendente |

A [referência Meta de mensagens](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks/webhook-events/messages), relida no navegador, não documenta `is_story` nessa página. Ela diferencia contexto de anúncio e produto de Shops. A ausência do campo na documentação não resolve a limitação da captura.

A [referência Meta de referrals](https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks/webhook-events/messaging_referrals) descreve o evento para conversas existentes e aponta para postbacks no início de novas conversas. Não basta assinar `messages`: o futuro incremento precisa receber `messaging_referrals` e tratar o caminho de novos contatos. O [guia Manychat de Ref URL](https://help.manychat.com/hc/en-us/articles/14281358848924-Messenger-Ref-URL-Trigger) também distingue novos contatos e a ação Começar. Não prometer que qualquer abertura de link inicia imediatamente uma automação.

#### Conflitos de palavras-chave: requisito antes do novo gatilho

O [Manychat documenta prioridade por posição da palavra-chave](https://help.manychat.com/hc/en-us/articles/14281211785884-How-to-use-Keywords-Trigger-in-Manychat): quando mais de uma combina, a primeira da lista vence. Isso é uma política do produto, não uma escolha feita pelo webhook da Meta.

No MultiPost, `SharedFlowsRepository.ingest` percorre todos os canais ativos compatíveis de comentários, após validar integração, organização e perfil. A deduplicação do evento evita reentregas, mas não escolhe uma única automação vencedora entre fluxos compatíveis. Reutilizar esse comportamento diretamente para DM permitiria concorrência entre regras; não é o contrato proposto para Messenger.

Proposta para o novo gatilho, ainda sem implementação:

1. Manter o escopo explícito de organização, perfil, Página e tipo de gatilho. A mesma palavra em Páginas diferentes não constitui conflito; conexões duplicadas da mesma Página também precisam de política de propriedade para impedir disparos duplos entre perfis.
2. Recusar regras ativas idênticas no mesmo escopo e informar qual automação conflita. Aplicar a validação no backend para painel, API e MCP, inclusive sob ativações concorrentes.
3. Resolver sobreposições de regras diferentes com prioridade explícita e estável, executando uma única automação por evento. Exemplo: “quero” e “quero curso” podem combinar com o mesmo texto mesmo sem palavras cadastradas idênticas. Não escolher pelo ID/ordem incidental do banco.
4. Registrar qual regra venceu e quais não foram executadas por prioridade; deduplicar reentregas e tratar mensagens de eco/status sem disparar fluxos.
5. No roteamento por link, resolver a referência dentro da Página e do perfil autorizados. Uma referência pública identifica a campanha, não concede autorização para acessar outro perfil. Também precisa de tratamento de reentrega e da janela válida para responder.

**Ordem sugerida para decisão:** encerrar a lacuna de captura de Stories; se não surgir discriminador confiável, priorizar link de referência (com QR sobre a mesma base) para campanhas, depois DM por palavra-chave com prevenção de conflitos. Dark posts e vínculo com agendamentos permanecem no plano de comentários, sem depender de um gatilho Story. Esta revisão alterou somente documentação; nenhuma nova assinatura, automação ou mensagem real.

### Decisão e captura completa — 26/10/2026

O usuário aprovou melhorar a captura e repetir Story/DM. **QR Code e link de referência ficaram fora do escopo**, pois não foram requisitados pelos alunos. A ordem sugerida anteriormente não é uma aprovação desses recursos.

Novo modo local `full-json`, opt-in separado do resumo estrutural:

- Dois textos exatos, com sufixo aleatório por sessão, identificam os testes. Sem texto correspondente, não há armazenamento completo. A origem Story/DM continua dependendo da ação humana; o rótulo do texto não é uma classificação automática.
- HMAC, conexão atual e os cinco identificadores do escopo continuam obrigatórios. Todos os entries e mensagens precisam pertencer à Página e aos textos de teste. Lotes com outra Página, DM comum, `changes`, `standby`, eco ou eventos de controle são recusados apenas pela captura. Nenhum corpo é preservado nesses casos; o motivo `MIXED_BATCH` aparece na leitura. Comentários continuam no caminho normal.
- Preserva o corpo JSON original, incluindo espaços, Unicode, nomes desconhecidos, flags e metadados de todos os níveis. Não existe filtro de campos. Valida round-trip UTF-8; acima de 128 KiB recusa com `TOO_LARGE`, sem truncar e sem anunciar uma comparação completa.
- Corpo cifrado com o `EncryptionService` AES-256-GCM existente; falha fechado sem chave configurada. O conteúdo cifrado inclui organização, perfil, integração, app, Página e nonce da sessão. Chaves e corpo não são impressos em logs nem na leitura de metadados.
- Até quatro lotes por sessão, com chave Redis contendo nonce, deduplicação de bytes idênticos por SHA-256 e prazo absoluto máximo de 120 minutos. A escrita revalida atomicamente armamento, prazo e quota; não renova a retenção. Reagrupamentos diferentes de uma mesma mensagem podem consumir outro lote. `remaining: 0` indica quota esgotada, não ausência de entrega.
- `stop` interrompe novas capturas. Registros cifrados continuam disponíveis pelo nonce até o prazo original, quando expiram. Sessões novas usam outro nonce e não misturam os resultados anteriores.

```bash
# Execute somente após aplicar os fontes e validar o serviço local.
node tools/facebook-messenger-probe-local.mjs full-arm .secrets/facebook-stories-probe/scope.json 120
# Copie o nonce retornado; ele identifica esta sessão local.
node tools/facebook-messenger-probe-local.mjs full-read .secrets/facebook-stories-probe/scope.json <nonce>
node tools/facebook-messenger-probe-local.mjs full-export .secrets/facebook-stories-probe/scope.json <nonce>
node tools/facebook-messenger-probe-local.mjs stop .secrets/facebook-stories-probe/scope.json
```

`full-read` mostra somente metadados, motivos de recusa e quota. `full-export` decifra dentro do container local, confere escopo/sessão e hash, e grava os bytes originais em arquivos `0600`, numa pasta privada dentro de `.secrets`; não sobrescreve arquivo existente e não imprime o conteúdo. Repetir a exportação aceita um arquivo já existente somente se for regular, privado e tiver bytes idênticos, permitindo exportar o segundo teste depois do primeiro. **Essas cópias locais não expiram com Redis: devem ser removidas após a comparação.** Não copiar corpos para documentação, Git ou serviços externos; registrar a conclusão e um comparativo sanitizado.

O incremento não cria gatilho, envia mensagens, muda permissões/inscrições da Meta, altera o Instagram, migra dados nem cria imagem Docker. O teste humano deve começar somente depois da aplicação local e confirmação de sessão ativa; pedir primeiro a resposta pelo próprio Story, depois a DM direta usando o segundo texto retornado.


#### Aplicação local e janela para a segunda rodada

Backend e worker recompilados com `pnpm dev:local`, sem nova imagem Docker. Container saudável, zero reinícios, mesma imagem `de4e3f969a83f8b0bbb9fc5889aed501cc6cc8e48690e6d133af3cc35bbbbb00`; localhost e túnel responderam HTTP 200. Regressão: 610 testes aprovados; testes Redis reais: 5 aprovados; testes da exportação privada: 3 aprovados. Revisões de plano, código, segurança e documentação concluídas; exportação repetida foi ajustada para conferir os bytes existentes sem sobrescrever. `git diff --check` sem erros.

Captura completa armada às **16:14:34 de 26/10/2026 (São Paulo)**, somente na conexão Escorpiano já autorizada, com expiração às **18:14:34 do mesmo dia**. Leitura independente confirmou `active: true`, zero registros e quatro posições disponíveis. Metadados da sessão e os textos exatos ficam somente no arquivo local ignorado `.secrets/facebook-stories-probe/full-session.json`. Aguardando resposta pelo Story e depois DM direta com outra conta. Nenhum resultado real novo é afirmado nesta etapa; a comparação deve usar os corpos completos exportados, seguida de desarme e remoção das cópias locais.

#### Primeiro corpo completo recebido — 26/10/2026, 16h29 (São Paulo)

Após a confirmação humana de resposta pela caixa do próprio Story, a captura registrou o primeiro texto de teste às **16:29:32.603**, com estado `captured`. Exportação privada concluída, com conferência de escopo, sessão e integridade; corpo original de 335 bytes, sem truncamento. A sessão permanece ativa até o prazo original, com três posições disponíveis.

O corpo contém `object: page`, um `entry` com `time`, `id` e `messaging`, e uma mensagem com `sender.id`, `recipient.id`, `timestamp`, `message.mid` e `message.text`. Não há outras chaves, anexos, `reply_to`, `referral` ou flag `is_story` nesse corpo completo. Essa observação vale apenas para esta entrega; ainda não é uma comparação com a nova DM direta nem comprovação sobre outros clientes/cenários da Meta. Foi solicitado o segundo texto, enviado diretamente na mesma conversa, sem passar pelo Story nem responder a uma mensagem antiga. Nenhum envio automático ou mudança de assinatura foi realizado.

#### Comparação dos corpos completos concluída — 26/10/2026, 16h31 (São Paulo)

O usuário confirmou a mensagem direta pela mesma conversa, sem passar pelo Story nem usar resposta a mensagem antiga. O segundo corpo foi recebido às **16:30:56.073**, com estado `captured`, e exportado com as mesmas verificações de integridade, sessão e escopo. Os dois corpos originais foram comparados em todos os níveis, sem lista de campos permitidos, truncamento ou descarte de valores. São duas mensagens distintas do mesmo remetente, destinadas à mesma Página autorizada.

| Verificação | Resposta pelo Story | Mensagem direta | Resultado |
| --- | --- | --- | --- |
| Recebimento local | 16:29:32.603 | 16:30:56.073 | Eventos distintos |
| Tamanho original | 335 bytes | 332 bytes | Corpos completos |
| Nomes, tipos e quantidade de campos | Mesmo conjunto | Mesmo conjunto | Iguais |
| `object` | `page` | `page` | Igual |
| `entry[0].id`, `sender.id`, `recipient.id` | Identificadores omitidos | Identificadores omitidos | Valores iguais |
| `entry[0].time`, `messaging[0].timestamp` | Horários do primeiro evento | Horários do segundo evento | Diferentes |
| `message.mid` | ID da primeira mensagem | ID da segunda mensagem | Diferentes |
| `message.text` | Marcador exato do teste Story | Marcador exato do teste DM | Diferentes |
| `is_story`, ID de Story, `reply_to`, `referral`, anexos ou outros campos | Ausentes | Ausentes | Nenhum discriminador de origem recebido |

Estrutura comum abaixo, com valores pessoais substituídos por marcadores ilustrativos; não é uma cópia do corpo recebido:

```json
{
  "object": "page",
  "entry": [{
    "time": "<horário do lote>",
    "id": "<mesma Página>",
    "messaging": [{
      "sender": { "id": "<mesmo remetente>" },
      "recipient": { "id": "<mesma Página>" },
      "timestamp": "<horário da mensagem>",
      "message": {
        "mid": "<ID distinto por mensagem>",
        "text": "<texto de teste correspondente>"
      }
    }]
  }]
}
```

Os horários reais têm tipo numérico; as strings acima apenas evitam reproduzir os valores. As únicas diferenças de valor entre os corpos são `entry[0].time`, `entry[0].messaging[0].timestamp`, `message.mid` e `message.text`. O rótulo Story vem da ação confirmada pelo usuário, não de metadado enviado pela Meta. O texto do teste, o horário e o ID opaco da mensagem não são critérios seguros para classificar uma mensagem futura como Story.

**Conclusão:** nesta Página e nos cenários de texto testados, o webhook não forneceu informação que permita distinguir resposta a Story de DM direta, muito menos segmentar por Story específico. A comparação completa encerra a lacuna do resumo anterior, mas não prova ausência universal desse contexto em outros clientes ou cenários. Manter indisponível o gatilho exclusivo de Story; não implementar detecção por inferência de texto/ID. Um futuro gatilho **Mensagem no Messenger** por palavra-chave pode tratar ambos como mensagens recebidas, deixando claro esse alcance e resolvendo conflitos entre automações antes da ativação. Esse incremento continua sendo proposta, não funcionalidade implementada. QR Code e link de referência continuam fora do escopo por decisão do usuário.

Captura desarmada; leitura independente confirmou `active: false` com os dois registros. Cópias locais dos corpos removidas após a comparação; somente evidência sanitizada fica neste documento. Os registros cifrados do Redis continuam sujeitos ao prazo absoluto original de **18:14:34 de 26/10/2026**, sem renovação. Nenhuma mensagem automática, alteração de assinatura, gatilho novo ou modificação no Instagram/outras Páginas. Esta rodada validou a captura existente; não alterou código de execução nem exigiu reconstrução de imagem Docker.
