# Proteção SSRF nas chamadas de saída

## Comportamento padrão

Chamadas de saída que podem receber uma URL configurável usam o mesmo lookup
DNS pinado nos clientes Undici (`fetch`) e Axios. O IP é conferido no momento
em que a conexão é aberta e o cliente conecta ao endereço que acabou de ser
aprovado. Isso fecha a janela entre uma validação anterior e uma nova resolução
DNS, inclusive em redirects.

Hosts informados como IP literal (`127.0.0.1`, `[::1]`, `169.254.169.254`) não
passam pelo lookup — o Node pula o `lookup` quando o host já é um IP —, por isso
a mesma conferência (`isBlockedLiteralHost`) é repetida na abertura de cada
conexão: no `connect` do dispatcher Undici e no `createConnection` dos agentes
http/https do Axios, inclusive quando um redirect aponta para um IP.

São bloqueados por padrão:

- loopback, endereço não especificado e link-local;
- redes privadas IPv4 e IPv6;
- metadata (`169.254.0.0/16`, Azure WireServer `168.63.129.16`), CGNAT e faixas
  de benchmark;
- multicast, ranges reservados e IPv4 embutido em IPv6 (v4-mapped, SIIT, NAT64,
  6to4, Teredo).

Os dois clientes não aceitam trocar o transporte por chamada: `ssrfSafeFetch`
só aceita o próprio dispatcher pinado (usado por quem precisa forçar o guard
mesmo sob o opt-out) e o Axios SSRF-safe recusa `httpVersion: 2`, `transport`,
`socketPath`, `proxy` e agentes por requisição.

A proteção cobre o cliente compartilhado dos providers (`SocialAbstract`), os
downloads de mídia por Axios, o SDK do Bluesky, providers self-hosted como
WordPress, Mastodon, Lemmy, Listmonk e MeWe, uploads intermediários entregues
pelas APIs dos providers e os webhooks de saída.

URLs digitadas por usuários ou publicadas por terceiros são baixadas por
`fetchPublicUrl`, que soma ao guard um timeout de 30 s, um teto de bytes lido
em streaming e redirects seguidos manualmente (até 5), com protocolo e DNS
revalidados em cada salto:

| Origem | Protocolo | Teto | Opt-out |
|---|---|---|---|
| Imagem de referência da geração I2I (OpenAI) — mídia do storage local é lida do disco | HTTPS | 25 MB | não herda |
| Feed do autopost (`POST /autopost/send` e agendamento) | HTTPS | 5 MB | herda só na URL configurada; redirects voltam ao guard |
| Página do artigo de cada item do feed | HTTP ou HTTPS | 5 MB | não herda (link de terceiro) |
| Página para extração de conteúdo (`ExtractContentService`) | HTTP ou HTTPS | 5 MB | não herda |
| `uploadSimple` por URL (repost, IA, foto de perfil do canal) | HTTPS | 1 GB | não herda |

O erro devolvido ao usuário informa só o motivo (URL não pública, arquivo
grande demais, falha no download), sem ecoar a URL nem o status remoto.

## Instalações self-hosted em rede privada

Se o Robô MultiPost precisar alcançar um WordPress, Mastodon ou webhook HTTPS
dentro da mesma VPC/rede Docker, configure:

```dotenv
DISABLE_SSRF_PROTECTION=true
```

Reinicie backend e orchestrator depois de alterar a variável. O opt-out é
intencionalmente explícito e vale para as chamadas de providers/webhooks feitas
por usuários autenticados. Só o habilite quando todos os usuários da instância
forem confiáveis e a rede de destino estiver sob o mesmo controle operacional.

Uploads e importações públicas por URL **não** herdam esse opt-out: continuam
exigindo HTTPS público, validação de DNS, dispatcher pinado, limite de tamanho e
validação por magic bytes. Essa separação impede que a compatibilidade
self-hosted reabra acesso à rede interna pela API pública.

## Verificação

Os testes automatizados cobrem IP literal privado (IPv4/IPv6), a abertura de
conexão para IP literal (um servidor local em `127.0.0.1` recusado por `fetch` e
Axios, sem nenhuma requisição recebida), resposta DNS mista, DNS rebinding entre
validação e conexão, os agentes Axios/Undici, o opt-out e a separação entre
webhook confiável e upload público, além do `fetchPublicUrl` (protocolo, teto
lido em streaming, `content-length` acima do teto, resposta de erro, opt-out só
quando o chamador permite e um servidor local que nunca recebe a requisição).
