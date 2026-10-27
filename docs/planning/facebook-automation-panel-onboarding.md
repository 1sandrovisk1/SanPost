# Autorização do Facebook pelo painel

> Registro histórico da etapa inicial de onboarding (21–22/10/2026). As referências a motor pendente e ausência de Temporal descrevem esse incremento inicial. O criador e o envio automático foram implementados e homologados no Escorpiano em 22/10; consulte o [estado entregue](facebook-shared-creator-handoff-20261022.md) e o [manual atual](../operations/facebook-automation-panel.md). A retenção do diagnóstico abaixo incorpora a correção de 23/10.

Decisão de 21/10/2026: o usuário priorizou a jornada que os alunos executarão no site. Este incremento antecipa a autorização e o recebimento de eventos da etapa 0; não libera o motor compartilhado antes da prova real.

## Jornada

1. O administrador cadastra o App ID/Secret em Configurações → Credenciais → Meta e conecta a Página pelo fluxo existente de canais.
2. Na seção Facebook, seleciona uma Página já conectada no perfil atual e clica em **Autorizar automações**. O OAuth solicita os escopos de automação e retorna ao callback Facebook já cadastrado na Meta. Nenhum token é copiado pelo aluno.
3. O painel fornece URL de callback e token de verificação (não é access token), com instruções para configurar **Messenger from Meta → Configurações da API do Messenger → 1. Configure webhooks** e assinar `feed`. No layout observado em 22/10 não há necessidade de seletor de objeto: essa seção configura o objeto técnico `page`. Essa configuração é feita uma vez por aplicativo. Se o aplicativo já tem outro callback, o painel informa o conflito; não o substitui via API.
4. **Verificar e ativar recebimento** confere autorização, callback e inscrição na Meta. Somente a Página selecionada é inscrita. Campos já inscritos pelo próprio app são preservados, assim como outros apps. Após o OAuth, essa verificação/inscrição é tentada automaticamente se o callback já estiver correto.
5. O painel distingue autorização, callback, inscrição e último comentário recebido. Expõe claramente que envio automático ainda depende da implementação/prova restante. Receber um comentário não significa mensagem enviada.

## Contrato HTTP

Refinamento de UX em 22/10: a interface organiza **autorizar Página → configurar aplicativo uma vez → ativar Página** e posiciona a ativação após os valores/instruções do callback. A seção “2. Gere tokens de acesso” da Meta não exige ação manual na jornada do produto. Um perfil pode ter várias Páginas, mas o cadastro de credenciais mantém um único App ID/Secret efetivo por perfil; múltiplos aplicativos no mesmo perfil não estão incluídos neste incremento. Datas seguem idioma do painel e fuso do navegador, com escape delegado ao React somente nessas interpolações. Nenhuma alteração no contrato HTTP ou na resolução de credenciais.

Esclarecimento confirmado pelo usuário em 22/10: o requisito é **várias Páginas Facebook usando o mesmo aplicativo Meta**, já contemplado pelo modelo acima. Não há pedido de vários App IDs no mesmo perfil.

Rotas autenticadas `/facebook-automations`, com política `Sections.ADMIN`, contexto explícito de organização/perfil/usuário. Perfil obrigatório; integração deve ser Facebook, ativa, selecionada (sem `inBetweenSteps`), pertencer exatamente à organização/perfil. Sem fallback para perfil nulo.

| Método e rota | Entrada | Resultado |
|---|---|---|
| GET `/` | contexto autenticado | Páginas do perfil (`id`, `pageId`, `name`), sem tokens |
| GET `/:integrationId` | contexto + integração | configuração para copiar, estado local e última verificação com horário; sem consulta automática à Meta |
| POST `/:integrationId/authorize` | contexto + integração | `{url}` OAuth; state aleatório de 256 bits, prefixo `fbauto_`, TTL 10 min, vinculado a usuário/org/perfil/integração e fingerprint das credenciais |
| POST `/complete` | `{state, code}` | consome state atomicamente, valida o contexto e credenciais, troca código, obtém token apenas da Página escolhida, valida app/Página/escopos, persiste cifrado e tenta ativar recebimento; retorna integração e status |
| POST `/:integrationId/activate` | contexto + integração | inspeção atual; inscreve `feed` somente com callback correto e permissões válidas; confirma com GET depois do POST, sem retry cego |

Erros sanitizados: 400 entrada inválida, 403 contexto obrigatório, 404 integração fora de escopo, 409 state/credenciais alterados, 412 credenciais ausentes, 502/resultado bloqueado para falha Meta. Nunca retornar códigos OAuth, access tokens, app secret, bodies/URLs Meta ou stack.

Callback público `/public/facebook-automations/:appId`: GET valida token de verificação e challenge; POST exige corpo bruto e HMAC SHA-256 antes de processar. Endpoint próprio do aplicativo, compartilhado entre suas Páginas. Cada `entry.id` é resolvido novamente para integração/org/perfil ativos e autorização persistida; páginas desconhecidas e Instagram são ignorados. Eventos de lote misto não cruzam perfis. Persistir somente horário e ID do comentário/post no diagnóstico por integração, TTL 7 dias, sem texto/autor; não iniciar Temporal ou enviar mensagens neste incremento. Duplicatas não executam efeitos de envio.

## Implementação e limites

- Controller fino → `FacebookAutomationSetupService` → `FacebookAutomationSetupRepository`. DTOs em `dtos/integrations/`. Serviços/repositório registrados em `ApiModule`; PrismaRepository e EncryptionService existentes são reutilizados.
- Persistência aditiva em `ProviderCredential`, chave interna `facebook-automation:<appId>:<pageId>`, org/perfil exatos. Registro cifrado contém integração, app, Page token e app secret necessários para a assinatura. Nenhum schema, migração ou alteração do token de publicação/Instagram. Esses registros internos não devem aparecer na listagem genérica de credenciais; CRUD genérico deve bloquear leitura/escrita/remoção desse namespace.
- Token de verificação derivado por HMAC do app secret e identificador/URL de callback. Mesmo app nesta instalação produz a mesma configuração para todos os perfis. Troca de app/secret exige reautorização; comparar com credenciais atuais na operação autenticada e na recepção para impedir credenciais antigas continuarem válidas após mudança.
- Redis encapsulado no repositório: state consumido atomicamente, diagnóstico com TTL de 30 dias e vínculo à credencial atual (ajuste de 23/10/2026), e recibo de evento com TTL de 7 dias. Após cinco minutos, a interface identifica a data como última verificação registrada; o cache não substitui a validação atual de ativação/envio. Limites de consultas públicas e tamanho do corpo; entrada limitada a 100 entries, consulta por app e páginas do lote (sem varrer todo o banco), validação rígida de IDs.
- Reutilizar `FacebookProvider` por extensão opt-in de `ClientInformation` para solicitar/verificar os escopos adicionais. Publicação mantém seus escopos. Ramo `fbauto_` em `ContinueIntegration` usa endpoint autenticado dedicado e retorna às credenciais; callback legado permanece inalterado.
- Cliente Meta restrito ao host oficial/versionado, timeout, sem redirects e erros sanitizados. Acrescentar leitura de `subscriptions` e escrita de `subscribed_apps` ao cliente isolado; preservar escopos/campos existentes. Nenhuma escrita em `app/subscriptions` neste incremento.
- Frontend: componente próprio dentro da seção Facebook, SWR isolado e chaves por perfil, `useFetch`, primitives existentes, pt/en. Esconder dados de seleção anterior ao trocar perfil; ações desabilitadas durante requests.
- As fontes oficiais usadas para o contrato são `developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/` e `developers.facebook.com/docs/messenger-platform/webhooks/`; o acesso automatizado retornou 429 nesta etapa. As operações e respostas já observadas na prova local continuam registradas no runbook; confirmar a entrega real antes de declarar integração concluída.

## TDD e aceitação

Antes da implementação, testes RED co-localizados para serviço/repositório/cliente/provider/controllers: isolamento de org/perfil/Página; escopos opt-in; state de uso único, expirado/trocado e credenciais alteradas; Page/app/token errados; recusa parcial de escopos; callback ausente/divergente; paginação incompleta; preservar campos; falha/timeout e readback da inscrição; cifragem obrigatória; namespace interno protegido; webhook bruto/HMAC, perfil removido, mistura de Páginas/segredos e desconhecidos; não expor tokens nem enviar mensagens. Testar continuidade do callback legado. Regressão Instagram e Facebook de publicação, build backend, checagem frontend e navegador local após revisão funcional/segurança. Não automatizar login/consentimento Meta.

Entregar manual pt-BR reproduzível e atualizar progresso/changelog com o que está implementado versus pendente. Revisão obrigatória antes do código e revisão funcional/segurança após o lote, conforme CLAUDE.md.
