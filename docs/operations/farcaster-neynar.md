# Farcaster via Neynar (managed signers)

O canal Farcaster e o login com Farcaster usam **managed signers** da Neynar
(porte do Postiz #2078/#2080, out/2026). O fluxo antigo — Sign In With Neynar
(SIWN), uma janela da Neynar que devolvia o signer por `postMessage` — saiu do
código, junto com o CSS do `@neynar/react` no frontend.

## Como funciona

1. O usuário clica em **Farcaster** (Adicionar canal, Reconectar canal ou login).
2. O backend cria um signer na Neynar (`POST /v2/farcaster/signer/`), assina o
   pedido (`SignedKeyRequest`, EIP-712) com a carteira de custódia da conta do
   app e registra a chave (`POST /v2/farcaster/signer/signed_key/`).
3. O backend guarda o signer num **registro no Redis**
   (`farcaster:signer:<requestId>`, 15 min) com o vínculo de quem o criou e
   devolve ao navegador só um `requestId` opaco, a URL de aprovação e o QR. O
   `signer_uuid` nunca sai do servidor.
4. O modal mostra o **QR code** e **Copiar link do Farcaster**. O usuário abre
   no celular e aprova o pedido no app do Farcaster.
5. O modal consulta o status a cada 2 s por até 10 min (`POST .../status`, com o
   `requestId` no corpo). Aprovado, o `requestId` segue pela aba
   (`sessionStorage`, nunca pela URL) para a página que conclui a conexão ou o
   login; o backend confere o vínculo, lê o FID e o perfil **na Neynar** e
   apaga o registro (uso único).

### Vínculo e uso único

| Fluxo | Rotas | Vínculo exigido |
|---|---|---|
| Login | `POST /auth/farcaster/signer` e `/auth/farcaster/signer/status` (públicas) | cookie httpOnly `farcaster_login` com um nonce aleatório (`makeSecureId`), gravado na criação; o Redis guarda só o hash. As trocas do code — `POST /auth/oauth/FARCASTER/exists`, `/auth/login` e `/auth/register` com provider `FARCASTER` — exigem o mesmo cookie. |
| Canal | `POST /integrations/farcaster/signer` e `/integrations/farcaster/signer/status` (autenticadas) | org + usuário + perfil de quem criou e o `state` do `/integrations/social/wrapcast` daquele fluxo; o status exige a mesma org e o mesmo usuário; a conexão (`/integrations/social-connect/wrapcast`) exige o mesmo `state`. |

Code desconhecido, de outro fluxo ou de outro navegador é recusado **antes** de
qualquer chamada à Neynar (400 `farcaster_invalid_code` no login; "Código de
conexão do Farcaster inválido" no canal). O registro é apagado quando o login,
o cadastro ou a conexão terminam.

**Limite que o vínculo não cobre:** quem cria o pedido e manda o QR/link para
outra pessoa aprovar ("aprove aqui") conecta ou entra na conta de quem aprovou —
é o risco de qualquer fluxo de aprovação por QR. A defesa é o nome da conta do
app mostrado no Farcaster na hora de aprovar; oriente os usuários a só aprovar
pedidos que eles mesmos abriram.

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
|---|---|---|
| `NEYNAR_SECRET_KEY` | sim | Chave da API da Neynar. Usada no backend (signer) e no worker (publicação). Canais já conectados publicam só com ela. |
| `NEYNAR_APP_FID` | sim (para conectar) | FID da conta do Farcaster que representa o app — é o nome que o usuário vê pedindo acesso. |
| `NEYNAR_APP_MNEMONIC` | sim (para conectar) | Frase de recuperação da carteira de custódia da conta do `NEYNAR_APP_FID`. **Ela controla a conta inteira**, não só os pedidos de signer: use uma conta de marca dedicada, sem ativos nem seguidores importantes, e guarde o valor num gerenciador de segredos (nunca em `.env` versionado, `docker-compose.yaml` ou `NEXT_PUBLIC_*`). |
| `NEYNAR_SPONSOR_SIGNERS` | não | `"true"` faz a Neynar pagar a taxa on-chain do signer (debitada dos créditos da conta Neynar) **só na conexão de canal** (rota autenticada). O login nunca é patrocinado: a rota é pública e cada clique cria um signer. Sem patrocínio, o usuário paga no app do Farcaster. |
| `NEYNAR_CLIENT_ID` | não | Só liga o botão **Farcaster** na tela de login/cadastro. Vazio = sem login com Farcaster: as rotas públicas e a troca do code com provider `FARCASTER` respondem 404 (o canal continua funcionando). |

`NEYNAR_LOGIN_URL` deixou de existir (era do SIWN).

Sem `NEYNAR_SECRET_KEY`, `NEYNAR_APP_FID` (inteiro positivo) e
`NEYNAR_APP_MNEMONIC`, o modal avisa "O Farcaster não está configurado nesta
instância" e nenhum signer é criado.

### Por que não é por workspace

Diferente dos providers OAuth (Credenciais por workspace), as credenciais da
Neynar são da instância: o signer gerenciado só funciona com a chave da API que
o criou, e a publicação no worker não tem caminho de credencial por workspace.
Guardar uma frase de recuperação por workspace também ampliaria a exposição de
uma carteira de custódia. Ver `libraries/nestjs-libraries/src/integrations/social/CLAUDE.md`.

### Obter os valores

1. **Chave da API:** painel de desenvolvedor da Neynar (`dev.neynar.com`) → app
   → API key.
2. **Conta do app:** crie uma conta do Farcaster **só** para a marca da
   instância. O `NEYNAR_APP_FID` aparece no perfil dela (ou via API da Neynar).
3. **Frase de recuperação:** no app do Farcaster dessa conta, em configurações
   avançadas → frase de recuperação. Copie direto para o gerenciador de
   segredos do deploy.

## Limites e custo

- Rotas públicas do login: 30 criações e 1000 consultas por hora por cliente
  (primeiro IP do `x-forwarded-for`; valor que não é IP cai no IP da conexão) e
  teto global de 10× por rota. Trocas do code com provider `FARCASTER`
  (`exists`, `login`, `register`): 30 por hora por cliente, mesmo teto.
- Rotas do canal: mesmos números, contados por org + usuário.
- O limite por IP depende do proxy da frente **sobrescrever** o
  `x-forwarded-for`. Em produção o Traefik troca o XFF não confiável pelo IP do
  cliente e o nginx do container só acrescenta o dele
  (`$proxy_add_x_forwarded_for`), então o primeiro item é o cliente real. Atrás
  de um proxy que apenas acrescenta, o cliente escolhe o primeiro item e só o
  teto global vale.
- Toda chamada à Neynar tem timeout de 30 s.

## Canais conectados antes (SIWN)

- **Nada é migrado.** O canal guarda o `signer_uuid` e a publicação continua
  usando `POST /v2/farcaster/cast/` com ele — só `NEYNAR_SECRET_KEY` é
  necessária para publicar.
- Enquanto `NEYNAR_SECRET_KEY` for a **mesma** chave (mesmo app da Neynar) e o
  usuário não revogar o acesso, os canais seguem publicando sem reconexão.
- Se a chave mudar (outro app da Neynar) ou o signer for revogado, a Neynar
  recusa o cast citando o signer. O post falha com "A autorização do Farcaster
  deste canal foi revogada…", o canal fica como **precisa reconectar**, com
  notificação e o motivo em **Status > Problemas**. Para resolver:
  **Reconectar canal** (abre o modal do QR; precisa ser a mesma conta do
  Farcaster) ou **Adicionar canal > Farcaster** com a mesma conta.
- Chave recusada (401), conta sem créditos (402), 403 genérico (plano/endpoint)
  e gateway fora (502/503/504, retentado antes) **não** desconectam os canais:
  o post falha com a mensagem para o administrador.

## Login com Farcaster

- Só aparece com `NEYNAR_CLIENT_ID` definido.
- O cookie `farcaster_login` usa as mesmas flags do cookie `auth` (Secure +
  SameSite=None fora do `NOT_SECURED`). Com `NOT_SECURED` e frontend/backend em
  origens diferentes, o navegador não manda o cookie e o login com Farcaster
  falha (mesma origem funciona).
- **Signer do login continua aprovado:** a Neynar não revoga managed signers
  pela API (a remoção da chave é on-chain, pela conta do usuário). Depois do
  login a instância apaga o registro e não guarda o signer, mas ele segue com
  permissão de escrita na conta do usuário, sob a chave da Neynar desta
  instância, até o usuário revogar o app no Farcaster. Quem tem só o
  `requestId` não consegue reutilizá-lo (uso único + cookie).
- O fork não tem o cookie `oauth_state` do login do upstream; o vínculo do
  login com Farcaster é o cookie do próprio signer.

## Roteiro de teste em produção

1. Configure as variáveis (mnemonic via gerenciador de segredos), reinicie
   backend e worker e confira nos logs a ausência de `criação do signer do
   Farcaster falhou`.
2. **Canal novo:** Adicionar canal → Farcaster. O modal mostra o QR; aprove no
   celular. O canal aparece com nome e foto da conta. Confira que a URL final
   não tem `code=`.
3. **Publicação:** agende um post com texto e uma imagem; confira o cast e o
   link do post publicado. Repita escolhendo um canal do Farcaster
   (configurações do post → Adicionar canal) e com um comentário (resposta
   encadeada).
4. **Canal antigo (SIWN):** publique num canal conectado antes da mudança. Se
   falhar com o motivo de autorização, use **Reconectar canal** e publique de
   novo. Clique no "!" do canal uma vez: deve abrir um único modal.
5. **Revogação:** revogue o acesso do app no Farcaster e publique — o post deve
   falhar e o canal ir para "precisa reconectar" com notificação.
6. **Login (se `NEYNAR_CLIENT_ID`):** em aba anônima, Entrar → Farcaster →
   aprovar → cadastro/entrada na conta `farcaster_<fid>`. Abrir
   `/auth?provider=FARCASTER&code=<qualquer>` em outra aba não deve logar.
7. **Patrocínio:** com `NEYNAR_SPONSOR_SIGNERS=true`, a aprovação de um canal
   não cobra a taxa do usuário; a do login cobra (não é patrocinada).

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Modal: "O Farcaster não está configurado nesta instância" | Falta uma das três variáveis, ou `NEYNAR_APP_FID` não é número. |
| Modal: "Não foi possível iniciar a conexão com o Farcaster" | Frase de recuperação que não é da conta do `NEYNAR_APP_FID` (a Neynar recusa a assinatura) ou Neynar fora do ar. Ver `FarcasterSignerService` no log do backend. |
| Modal: "O Farcaster está indisponível nesta instância" | A Neynar recusou a chave (401) ou a conta está sem créditos (402). |
| Modal: "Esta aprovação do Farcaster não é mais válida" | Registro expirado (15 min), cookie do login ausente (outra aba/navegador, `NOT_SECURED` entre origens) ou state de outro fluxo. |
| Modal: "Muitas tentativas de conexão com o Farcaster" | Limite por cliente ou teto global atingido (429). |
| Todos os canais Farcaster falharam de uma vez com "recusou a chave da API" | `NEYNAR_SECRET_KEY` errada ou revogada. Os canais não são desconectados. |
