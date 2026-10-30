# API Pública do Robô MultiPost (referência para n8n / integrações)

Referência geral da API pública — autenticação, canais, posts, upload, analytics e mais. Para **automações de comentário do Instagram**, veja [`public-flows-api.md`](public-flows-api.md).

---

## Autenticação

Header **`Authorization`** com a chave de API (valor **cru, sem `Bearer`**). Pegue em **Configurações > Integrações** (chave de organização = todos os perfis; chave de perfil = só o próprio).

```
Authorization: SUA_CHAVE_DE_API
```

`401` chave ausente/inválida · `403` chave de perfil tentando outro perfil (canal de outro perfil nas rotas por id também responde 403; canal inexistente, 404).

## Swagger interativo

`/docs` no domínio do backend (ex.: `https://SEU_BACKEND/docs`). Clique em **Authorize**, cole a chave, e use **Try it out**. Os endpoints públicos ficam sob `/public/v1` (a UI mostra sem o prefixo `/api`).

---

## Endpoints (tag **Public API**)

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/public/v1/profiles` | Listar perfis (id, name, isDefault) |
| `GET` | `/public/v1/integrations` | Listar canais conectados (use `id` como `integrationId`) |
| `GET` | `/public/v1/social/:integration` | URL de OAuth para conectar um canal; com chave de perfil, o canal conectado nasce no perfil da chave (canais sem perfil criados antes continuam sem perfil; reconectar um deles por chave de perfil em provider de duas etapas pode responder 409) |
| `GET` | `/public/v1/find-slot/:id` | Próximo horário livre para agendar |
| `POST` | `/public/v1/upload` | Upload de arquivo (multipart, campo `file`) |
| `POST` | `/public/v1/upload-from-url` | Upload de mídia a partir de uma URL |
| `GET` | `/public/v1/media` | Listar a biblioteca de mídia (`page`, `search` pelo nome original; 18 por página; chave de perfil: só a mídia do perfil e a sem perfil) |
| `GET` | `/public/v1/posts` | Listar posts (`startDate`/`endDate`); posts com falha trazem `error` com a mensagem curada do provider (ou `null`) |
| `POST` | `/public/v1/posts` | Criar / agendar / rascunho de post |
| `DELETE` | `/public/v1/posts/:id` | Excluir um post — devolve `{ "id": "<post>" }` (grupo inexistente: `{ "error": true }`) |
| `GET` | `/public/v1/analytics/:integration` | Analytics de um canal (`?date=` dias) |
| `GET` | `/public/v1/analytics/post/:postId` | Analytics de um post |
| `POST` | `/public/v1/generate-video` | Gerar vídeo (IA) |
| `GET` | `/public/v1/notifications` | Listar notificações |
| `DELETE` | `/public/v1/integrations/:id` | Excluir um canal e seus posts (chave de perfil: só canais do próprio perfil) |
| `GET` | `/public/v1/integration-settings/:id` | Configurações/validação de um canal (idem) |
| `POST` | `/public/v1/integration-trigger/:id` | Executar ferramenta nativa de um canal (idem) |
| `GET` | `/public/v1/posts/:id/missing` | Conteúdo faltante de um post (chave de perfil: só posts do próprio perfil; fora dele, lista vazia) |
| `PUT` | `/public/v1/posts/:id/release-id` | Atualizar o id externo de um post — corpo `{ "releaseId": "<id>" }`, string de 1 a 512 caracteres com um único id de plataforma (`^[A-Za-z0-9._~:/-]+$`); 404 para post de outro perfil |

> Automações: `POST/GET/PUT/DELETE /public/v1/flows` — ver [`public-flows-api.md`](public-flows-api.md).

---

## Fluxo típico no n8n (publicar com imagem)

1. **Descobrir o canal:** `GET /public/v1/integrations` → copie o `id` do canal desejado.
2. **Subir a imagem:** `POST /public/v1/upload-from-url` com `{ "url": "https://.../imagem.jpg" }` → retorna `{ id, path }`.
3. **Criar o post:** `POST /public/v1/posts` usando o `path` da imagem e o `id` do canal (ver abaixo).
4. (Opcional) **Automação:** `POST /public/v1/flows` para responder comentários com DM.

---

## `POST /public/v1/posts` — corpo

| Campo | Tipo | Obrigatório | Notas |
|---|---|---|---|
| `type` | `now` \| `schedule` \| `draft` | ✅ | Publicar agora, agendar ou rascunho |
| `date` | string ISO 8601 | ✅ | Quando publicar (use uma data futura para `schedule`) |
| `shortLink` | boolean | ✅ | Encurtar links do post |
| `republish` | boolean | — | Obrigatório como `true` para publicar novamente um post que já está `PUBLISHED` |
| `tags` | `{value,label}[]` | ✅ | Tags (pode ser `[]`). `value` pode ser o id da tag ou o nome; `label` é o nome. A tag é procurada pelo id e, se não achar, pelo nome — sempre entre as tags do perfil da chave |
| `posts` | `Post[]` (≥1) | ✅ | Um item por canal |

Os tipos são estritos. Envie booleanos e números como valores JSON reais:
`false`, `true` e `10`. Valores em texto como `"false"`, `"true"` ou `"10"`
recebem HTTP 400 em vez de serem convertidos silenciosamente.

Ao editar um post já publicado (um item de `value` contém o `id` existente),
`type: "schedule"` ou `type: "now"` publicaria o conteúdo outra vez. A API
recusa essa operação por padrão. Use `type: "update"` para alterar sem publicar,
ou envie `republish: true` quando a nova publicação for intencional. Texto como
`"true"` não é aceito como confirmação.

**`posts[]` (Post):**
| Campo | Tipo | Notas |
|---|---|---|
| `integration.id` | string | `integrationId` do canal (de `GET /integrations`) |
| `value` | `{content, image[]}[]` | Variantes de conteúdo (texto + mídias) |
| `settings.__type` | string | Identificador do provider (`instagram`, `x`, `facebook`, …). Obrigatório se `type !== 'draft'` |
| `group` | string | Opcional (agrupa posts) |

**`value[].image[]` (MediaDto):** `{ id, path }` — `path` é a URL da mídia (de `POST /upload`).

**Pinterest (`settings.board`):** o **id numérico** do board (use a lista de boards do canal), nunca o nome — valor não numérico responde **400** com a orientação. Em `zernio-pinterest` o campo continua obrigatório como string, sem exigir id numérico; hoje o Zernio ignora o valor e publica no primeiro board da conta.

**`settings` por canal:** além de `__type`, aceita opções do provider. No Instagram:
- `settings.post_type` — `"post"` (feed/Reels) ou `"story"`.
- `settings.cover` — **capa do Reels**: um `MediaDto` `{ id, path }` (mídia de `POST /upload`). O `path` (URL pública) é enviado como `cover_url` à Meta. Só vale para **Reels** (um único vídeo `.mp4`, não story); em foto/carrossel/story é ignorado. Exige `id` **e** `path` válidos — senão a API responde **400**. Sem `settings.cover`, a **thumbnail da própria mídia** (`image[].thumbnail`, quando existir na biblioteca) é usada como `cover_url`.
- `settings.collaborators` — lista `[{ label }]` de contas a marcar como colaboradoras; o `@` inicial é removido. Em carrossel os colaboradores vão no container, não nos itens.

No YouTube:
- `settings.thumbnail` — miniatura própria do YouTube (`MediaDto`); continua aceita e **vence** a capa da mídia. Sem ela, a miniatura é a capa do vídeo (`image[0].thumbnail`). Se o YouTube recusar a miniatura (canal não verificado por telefone, imagem grande demais), o vídeo continua publicado: o post fica com erro, mas guarda o id e o link do vídeo — não publique de novo.

No Facebook:
- `settings.post_type` — `"post"` (feed/Reel) ou `"story"`.
- `settings.title` — título opcional para **posts de vídeo** (não story); ignorado em foto/texto.

No TikTok Business (`tiktok-business`), além das opções do TikTok (`privacy_level`, `content_posting_method`, `duet`, `stitch`, `comment`, `autoAddMusic`, `brand_content_toggle`, `brand_organic_toggle`, `video_made_with_ai`, `title`):
- `settings.music` — `{ id, audio_volume?, video_volume? }`: faixa da biblioteca comercial (o `id` vem da função `musicSearch` do canal); volumes de 0 a 100 (padrão 50) só em vídeo. Em foto, `autoAddMusic: "yes"` sorteia uma faixa e ignora `music`.
- `settings.location` — `{ id, name }`: localização (o `id` vem da função `locationSearch`).
- Música e localização só valem com `content_posting_method: "DIRECT_POST"`; em `UPLOAD` o TikTok guarda só a legenda.
- Legenda até 2.200 caracteres em vídeo e 4.000 em foto (UTF-16); acima disso a criação responde **400**. Mídia: um vídeo ou até 35 fotos, cada foto com no máximo 1080px no lado menor — fora disso o post termina com erro na hora de publicar, sem chegar ao TikTok.

### Exemplo — publicar agora com imagem
```json
{
  "type": "now",
  "date": "2026-06-10T14:30:00Z",
  "shortLink": false,
  "tags": [],
  "posts": [
    {
      "integration": { "id": "SEU_INTEGRATION_ID" },
      "value": [
        {
          "content": "Meu post de teste 🚀",
          "image": [{ "id": "media-1", "path": "https://seu-cdn.com/imagem.jpg" }]
        }
      ],
      "settings": { "__type": "instagram" }
    }
  ]
}
```

### Exemplo — Reels do Instagram com capa
> Suba o vídeo (`.mp4`) e a imagem de capa via `POST /upload` (ou `/upload-from-url`) e use os `{ id, path }` retornados.
```json
{
  "type": "now",
  "date": "2026-06-10T14:30:00Z",
  "shortLink": false,
  "tags": [],
  "posts": [
    {
      "integration": { "id": "SEU_INTEGRATION_ID" },
      "value": [
        {
          "content": "Meu Reels 🚀",
          "image": [{ "id": "media-video", "path": "https://seu-cdn.com/video.mp4" }]
        }
      ],
      "settings": {
        "__type": "instagram",
        "post_type": "post",
        "cover": { "id": "media-capa", "path": "https://seu-cdn.com/capa.jpg" }
      }
    }
  ]
}
```

### Exemplo — rascunho (sem `settings`)
```json
{ "type": "draft", "date": "2026-06-15T09:00:00Z", "shortLink": false, "tags": [],
  "posts": [{ "integration": { "id": "SEU_INTEGRATION_ID" }, "value": [{ "content": "Rascunho ✍️", "image": [] }] }] }
```

> No Swagger, o `POST /posts` traz esses exemplos prontos no dropdown do "Example Value" (Try it out).

---

## Upload, analytics e outros

- **`POST /upload`** (multipart): campo `file`. Retorna `{ id, path }`.
- **`POST /upload-from-url`**: `{ "url": "https://seu-cdn.com/imagem.jpg" }` (https público). Retorna `{ id, path }`.
- **`GET /analytics/:integration?date=30`**: estatísticas do canal nos últimos N dias.
- **`GET /analytics/post/:postId?date=7`**: estatísticas de um post.
- **`GET /posts?startDate=...&endDate=...`**: lista posts no intervalo (ISO 8601).
- **`POST /generate-video`**: `{ "type": "...", "output": "vertical" | "horizontal", "customParams": {...} }`.

---

## Referências

- [`public-flows-api.md`](public-flows-api.md) — automações de comentário (Flows).
- Swagger: `/docs` (tags **Public API** e **Automações (Flows)**).
