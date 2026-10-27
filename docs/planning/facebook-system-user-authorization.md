# Autorização de comentários Facebook com usuário de sistema

## Objetivo

Oferecer uma alternativa ao login do Facebook, reaproveitando o token cadastrado
na aba **Usuário de sistema**. A autorização é aplicada somente à Página
selecionada no perfil atual. O webhook continua compartilhado por aplicativo.

## Contrato

- `POST /facebook-automations/:integrationId/system-user`: ADMIN/UPDATE,
  headers `x-expected-org-id` e `x-expected-profile-id` obrigatórios e iguais ao
  contexto autenticado. Não aceita token no corpo. Obtém a credencial do perfil
  exato, valida o usuário de sistema e deriva o token da Página selecionada.
- Resposta 200: `{ integrationId, status }`, sem segredos. Usa as etapas já
  existentes do onboarding. Erros 412 com códigos fixos para token ausente,
  tipo incorreto, aplicativo divergente, expiração, permissões ou acesso à Página;
  409 para contexto/credencial alterados durante a operação.
- `GET /facebook-automations/:integrationId`: acrescenta disponibilidade do
  cadastro de sistema e origem da autorização, sem divulgar o token. A leitura
  continua local, sem autorizar ou inscrever Páginas.

## Regras

1. Token de sistema lido por `getRaw` no perfil exato, sem fallback por ambiente,
   herança do perfil Default ou uso de tokens de outras contas.
2. Antes de substituir a conexão: verificar tipo SYSTEM_USER, App ID, validade,
   permissões, derivação do Page Access Token e sua identidade/tipo PAGE.
3. Validar novamente Página, credenciais do aplicativo e token de origem antes
   de gravar. Falha de validação preserva a autorização anterior.
4. Usar a conexão cifrada existente, mantendo `Integration.id`, flows, posts,
   histórico e ledger de envio. Não altera o token de publicação do canal.
5. Troca/renovação explícita pelo painel, sem fallback silencioso, novo cron ou
   repetição de envio de mensagens. O mesmo botão pode reaplicar um token novo
   mantendo todas as automações.
6. O novo endpoint apenas autoriza e consulta a situação do recebimento. Não
   inscreve `feed`, não envia mensagens e não troca o callback. Quando necessário,
   o botão existente **Verificar e ativar recebimento** continua responsável por
   inscrever somente a Página selecionada, preservando os campos já inscritos.
7. Validade vem do diagnóstico da Meta: zero significa sem vencimento programado,
   nunca garantia de acesso permanente. Registrar a origem da autorização e a
   validade do token de sistema separadamente do token da Página.
8. Testes reais somente em Escorpião Veneno (`271852286004401`), integração
   `cmvi6us6q0005pm090b98kalb`. Falta de token fornecido pelo usuário não autoriza
   buscar credenciais em outro perfil. Não registrar tokens ou respostas brutas.

## Interface e validação

A tela principal mantém seleção da Página, status e ações. A alternativa aparece
ao autorizar quando há token cadastrado; a troca de uma conexão já pronta fica
em **Ajuda → Diagnóstico**. Orientações de cadastro ficam no drawer. Mantidos
OAuth e Instagram, traduções pt/en, componentes nativos e isolamento por perfil.

TDD para derivação, tipo/app/validade/permissões/identidade, falhas sem sobrescrita,
escopo, concorrência de credenciais, ausência de segredos, renovação sem recriar
flows e ações do frontend. Depois: regressão Facebook/Instagram, segurança,
TypeScript, builds e navegador no ambiente local.

Referência: a [coleção oficial Messenger da Meta](https://www.postman.com/meta/messenger-platform-api/collection/iyp204x/messenger-platform-api)
declara suporte a tokens de usuários e usuários de sistema. A prova específica
de comentário → mensagem privada com essa origem foi concluída no Escorpiano em
25/10/2026, com aceite da Meta e recebimento confirmado pelo usuário. O registro,
os horários e a evidência de preservação de fluxo/histórico estão no
[guia operacional](../operations/facebook-system-user-authorization.md).
