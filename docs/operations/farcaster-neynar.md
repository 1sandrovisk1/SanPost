# Farcaster via Neynar (managed signers)

O canal Farcaster e o login com Farcaster usam **managed signers** da Neynar
(porte do Postiz #2078/#2080, out/2026). O fluxo antigo — Sign In With Neynar
(SIWN), uma janela da Neynar que devolvia o signer por `postMessage` — saiu do
código, junto com o pacote `@neynar/react` no frontend.

## Como funciona

1. O usuário clica em **Farcaster** (Adicionar canal, Reconectar canal ou login).
2. O backend cria um signer na Neynar (`POST /v2/farcaster/signer/`), assina o
   pedido (`SignedKeyRequest`, EIP-712) com a carteira de custódia da conta do
   app e registra a chave (`POST /v2/farcaster/signer/signed_key/`).
3. O modal mostra um **QR code** e o botão **Copiar link do Farcaster**. O
   usuário abre no celular e aprova o pedido no app do Farcaster.
4. O modal consulta o status a cada 2 s por até 10 min. Aprovado, o backend lê
   o FID e o perfil do dono do signer **na Neynar** e conclui a conexão (canal)
   ou o login.

A chave da API e a frase de recuperação ficam só no backend/worker. O navegador
recebe apenas o `signer_uuid` (necessário para o polling), a URL de aprovação
e o QR (imagem gerada no servidor).

## Variáveis de ambiente

| Variável | Obrigatória | Uso |
|---|---|---|
| `NEYNAR_SECRET_KEY` | sim | Chave da API da Neynar. Usada no backend (signer) e no worker (publicação). |
| `NEYNAR_APP_FID` | sim | FID da conta do Farcaster que representa o app — é o nome que o usuário vê pedindo acesso. |
| `NEYNAR_APP_MNEMONIC` | sim | Frase de recuperação da carteira de custódia dessa conta. Só assina os pedidos de signer. **Trate como segredo de produção.** |
| `NEYNAR_SPONSOR_SIGNERS` | não | `"true"` faz a Neynar pagar a taxa on-chain do signer (debitada dos créditos da conta Neynar). Padrão: o usuário paga no app do Farcaster. |
| `NEYNAR_CLIENT_ID` | não | Só liga o botão **Farcaster** na tela de login/cadastro. Vazio = sem login com Farcaster (o canal continua funcionando). |

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
2. **Conta do app:** crie (ou use) uma conta do Farcaster para a marca da
   instância. O `NEYNAR_APP_FID` aparece no perfil dela (ou via API da Neynar).
3. **Frase de recuperação:** no app do Farcaster dessa conta, em configurações
   avançadas → frase de recuperação. Copie para o gerenciador de segredos do
   deploy; nunca para o repositório, `.env` versionado ou variáveis
   `NEXT_PUBLIC_*`.

## Canais conectados antes (SIWN)

- **Nada é migrado.** O canal guarda o `signer_uuid` e a publicação continua
  usando `POST /v2/farcaster/cast/` com ele.
- Enquanto `NEYNAR_SECRET_KEY` for a **mesma** chave (mesmo app da Neynar) e o
  usuário não revogar o acesso, os canais seguem publicando sem reconexão.
- Se a chave mudar (outro app da Neynar) ou o signer for revogado, a Neynar
  recusa o cast. O post falha com "A autorização do Farcaster deste canal foi
  revogada…", o canal fica como **precisa reconectar**, com notificação e o
  motivo em **Status > Problemas**. Para resolver: **Reconectar canal** (abre o
  modal do QR; precisa ser a mesma conta do Farcaster) ou **Adicionar canal >
  Farcaster** com a mesma conta.
- Uma chave da API recusada (401) ou sem créditos (402) **não** desconecta os
  canais: o post falha com a mensagem para o administrador.

## Login com Farcaster

- Só aparece com `NEYNAR_CLIENT_ID` definido; sem ele, `POST/GET
  /auth/farcaster/signer` respondem 404.
- Cada clique cria um signer na Neynar. As rotas públicas têm limite por
  cliente (30 criações e 1000 consultas por hora, pelo primeiro IP do
  `x-forwarded-for`) e um teto global por rota de 10× esse valor, porque o
  header pode ser forjado quando o proxy só acrescenta o IP.
- O fork não tem o cookie `oauth_state` do login do upstream; o login com
  Farcaster continua sem `state` (mesma situação dos demais logins sociais —
  follow-up na triagem de out/2026).

## Roteiro de teste em produção

1. Configure as quatro variáveis, reinicie backend e worker e confira nos logs
   a ausência de `criação do signer do Farcaster falhou`.
2. **Canal novo:** Adicionar canal → Farcaster. O modal mostra o QR; aprove no
   celular. O canal aparece com nome/foto da conta.
3. **Publicação:** agende um post com texto e uma imagem; confira o cast e o
   link do post publicado. Repita escolhendo um canal do Farcaster
   (configurações do post → Adicionar canal) e com um comentário (resposta
   encadeada).
4. **Canal antigo (SIWN):** publique num canal conectado antes da mudança. Se
   falhar com o motivo de autorização, use **Reconectar canal** e publique de
   novo.
5. **Revogação:** revogue o acesso do app no Farcaster e publique — o post deve
   falhar e o canal ir para "precisa reconectar" com notificação.
6. **Login (se `NEYNAR_CLIENT_ID`):** em aba anônima, Entrar → Farcaster →
   aprovar → cadastro/entrada na conta `farcaster_<fid>`.
7. **Patrocínio:** com `NEYNAR_SPONSOR_SIGNERS=true`, o app do Farcaster não
   deve cobrar a taxa do usuário na aprovação.

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Modal: "O Farcaster não está configurado nesta instância" | Falta uma das três variáveis, ou `NEYNAR_APP_FID` não é número. |
| Modal: "Não foi possível iniciar a conexão com o Farcaster" | Chave inválida, frase de recuperação que não é da conta do `NEYNAR_APP_FID` (a Neynar recusa a assinatura) ou Neynar fora do ar. Ver `FarcasterSignerService` no log do backend. |
| QR aprovado mas o modal não fecha | O polling expira em 10 min; confira a consulta `GET .../farcaster/signer` (429 = limite atingido). |
| Todos os canais Farcaster falharam de uma vez com "recusou a chave da API" | `NEYNAR_SECRET_KEY` errada ou revogada. Os canais não são desconectados. |
