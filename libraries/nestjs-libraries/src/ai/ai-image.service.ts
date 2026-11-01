import { HttpException, Injectable, Logger } from '@nestjs/common';
import { AiProviderResolverService } from './ai-provider-resolver.service';
import { ImageOptions } from './ai-credential.schemas';
import {
  fetchPublicUrl,
  PublicUrlFetchError,
} from '@gitroom/nestjs-libraries/upload/public-url.fetch';
import {
  extractUploadPathSegments,
  resolveSafeUploadFile,
} from '@gitroom/nestjs-libraries/upload/safe.upload.path';
import { readFile, stat } from 'fs/promises';
import { basename, extname } from 'path';

const MAX_REFERENCE_IMAGE_BYTES = 25 * 1024 * 1024;
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

const OPENROUTER_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

const DEFAULT_OPENAI_MODEL = 'gpt-image-2';
const DEFAULT_OPENROUTER_MODEL = 'google/gemini-3.1-flash-image-preview';

export type AiAspectRatio = '1:1' | '9:16' | '16:9';
const DEFAULT_ASPECT_RATIO: AiAspectRatio = '1:1';

/**
 * Mapeia aspect ratio universal (`1:1`, `9:16`, `16:9`) para o `size`
 * literal que a API OpenAI espera. Os 3 tamanhos abaixo cobrem
 * `gpt-image-2` e `gpt-image-1-mini` (familia atual). Modelos legacy
 * (DALL-E 2/3, gpt-image-1) nao sao mais expostos no catalogo.
 */
const ASPECT_TO_OPENAI_SIZE: Record<AiAspectRatio, string> = {
  '1:1': '1024x1024',
  '9:16': '1024x1536',
  '16:9': '1536x1024',
};

export type ImageMode = 'T2I' | 'I2I';

export interface GenerateImageOptions {
  aspectRatio?: AiAspectRatio;
  /** 'T2I' (default) gera a partir de texto. 'I2I' transforma uma imagem
   *  de referencia conforme o prompt. Quando 'I2I', `referenceImageUrl`
   *  e obrigatorio (validado no `generate()`). */
  mode?: ImageMode;
  referenceImageUrl?: string;
}

export interface GeneratedImage {
  base64: string;
  provider: string;
  model: string;
  credentialId: string;
}

/**
 * Extrai a mensagem original da resposta de erro do OpenAI/OpenRouter
 * e devolve um texto pt-BR informativo. Sempre preserva a mensagem
 * original entre aspas para que o usuario consiga buscar/reportar.
 *
 * Formatos aceitos:
 *  - JSON OpenAI: `{ "error": { "message": "...", "code": "...", "param": "..." } }`
 *  - JSON OpenRouter: `{ "error": { "message": "...", "code": "..." } }`
 *  - Texto livre (fallback)
 */
function extractOpenAiError(rawBody: string, status: number): string {
  try {
    const parsed = JSON.parse(rawBody);
    const msg = parsed?.error?.message;
    if (typeof msg === 'string' && msg.length > 0) {
      return `OpenAI recusou (HTTP ${status}): "${msg}".`;
    }
  } catch {
    // body nao e JSON
  }
  const snippet = rawBody.slice(0, 200);
  return `OpenAI recusou (HTTP ${status}): "${snippet}".`;
}

function extractOpenRouterError(rawBody: string, status: number): string {
  try {
    const parsed = JSON.parse(rawBody);
    const msg = parsed?.error?.message;
    if (typeof msg === 'string' && msg.length > 0) {
      return `OpenRouter recusou (HTTP ${status}): "${msg}".`;
    }
  } catch {
    // body nao e JSON
  }
  const snippet = rawBody.slice(0, 200);
  return `OpenRouter recusou (HTTP ${status}): "${snippet}".`;
}

@Injectable()
export class AiImageService {
  private readonly _logger = new Logger(AiImageService.name);

  constructor(private _resolver: AiProviderResolverService) {}

  /**
   * Gera imagem para o prompt informado e retorna base64 puro
   * (sem prefixo data:image/...).
   *
   * @param opts.aspectRatio  '1:1' (default), '9:16' (vertical), '16:9' (horizontal)
   * @param opts.mode         'T2I' (default) ou 'I2I' para image-to-image
   * @param opts.referenceImageUrl  obrigatorio quando mode='I2I'. URL publica
   *                                http(s) da imagem de referencia.
   */
  async generate(
    organizationId: string,
    prompt: string,
    profileId?: string,
    opts: GenerateImageOptions = {}
  ): Promise<GeneratedImage> {
    const mode: ImageMode = opts.mode ?? 'T2I';
    if (mode === 'I2I' && !opts.referenceImageUrl) {
      this._logger.warn(
        `generate rejeitado: mode=I2I sem referenceImageUrl (org=${organizationId} profile=${profileId ?? '-'})`
      );
      throw new HttpException(
        'referenceImageUrl e obrigatorio quando mode=I2I.',
        400
      );
    }

    const credential = await this._resolver.resolve(
      organizationId,
      'IMAGE',
      profileId
    );
    const options = (credential.options ?? {}) as ImageOptions;
    const aspectRatio: AiAspectRatio = opts.aspectRatio ?? DEFAULT_ASPECT_RATIO;

    this._logger.log(
      `generate start mode=${mode} provider=${credential.provider} model=${credential.model ?? '(default)'} aspect=${aspectRatio} promptLen=${prompt.length} hasRef=${opts.referenceImageUrl ? 'y' : 'n'} profile=${profileId ?? '-'}`
    );

    let base64: string;
    let modelUsed: string;

    if (credential.provider === 'openai' || credential.provider === 'custom') {
      if (credential.provider === 'custom' && !options.apiBaseURL) throw new HttpException('Configure uma URL base compatível.', 400);
      modelUsed = credential.model ?? DEFAULT_OPENAI_MODEL;
      base64 =
        mode === 'I2I'
          ? await this.generateOpenAiEdit(
              credential.apiKey,
              modelUsed,
              prompt,
              opts.referenceImageUrl as string,
              options,
              aspectRatio,
              options.apiBaseURL
            )
          : await this.generateOpenAi(
              credential.apiKey,
              modelUsed,
              prompt,
              options,
              aspectRatio,
              options.apiBaseURL
            );
    } else if (credential.provider === 'openrouter') {
      modelUsed = credential.model ?? DEFAULT_OPENROUTER_MODEL;
      base64 = await this.generateOpenRouter(
        credential.apiKey,
        modelUsed,
        prompt,
        options,
        aspectRatio,
        mode === 'I2I' ? opts.referenceImageUrl : undefined
      );
    } else {
      this._logger.warn(
        `Provider sem suporte para imagem: ${credential.provider} (credentialId=${credential.id})`
      );
      throw new HttpException(
        `Provider sem suporte para imagem: ${credential.provider}`,
        400
      );
    }

    return {
      base64,
      provider: credential.provider,
      model: modelUsed,
      credentialId: credential.id,
    };
  }

  private async generateOpenAi(
    apiKey: string,
    model: string,
    prompt: string,
    options: ImageOptions,
    aspectRatio: AiAspectRatio,
    baseURL?: string
  ): Promise<string> {
    const size = ASPECT_TO_OPENAI_SIZE[aspectRatio];

    const body: Record<string, unknown> = {
      model,
      prompt,
      n: options.numImages ?? 1,
      size,
    };
    if (options.quality && options.quality !== 'auto') {
      body.quality = options.quality;
    }

    let res: Response;
    try {
      res = await fetch(`${(baseURL ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/images/generations`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this._logger.error(
        `OpenAI images.generate fetch falhou (network): ${(err as Error).message}`
      );
      throw new HttpException(
        `Falha de rede ao chamar OpenAI: ${(err as Error).message}`,
        502
      );
    }

    if (!res.ok) {
      const errBody = await res.text();
      this._logger.warn(
        `OpenAI images.generate retornou ${res.status}: ${errBody.slice(0, 200)}`
      );
      throw new HttpException(extractOpenAiError(errBody, res.status), 502);
    }

    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) {
      this._logger.warn(
        `OpenAI images.generate respondeu 200 mas sem b64_json (model=${model})`
      );
      throw new HttpException('OpenAI nao devolveu imagem.', 502);
    }
    return b64;
  }

  // Midia do proprio storage local (`FRONTEND_URL/uploads/...`) e lida do
  // disco com o confinamento de `resolveSafeUploadFile`: instancias em http ou
  // em rede privada (dev, LAN) continuam usando a biblioteca de midia. Qualquer
  // outra URL passa por `fetchPublicUrl`.
  private async loadReferenceImage(
    url: string
  ): Promise<{ buffer: Buffer; contentType: string }> {
    const localFile = this.ownUploadFile(url);
    if (localFile) {
      if ((await stat(localFile)).size > MAX_REFERENCE_IMAGE_BYTES) {
        throw new PublicUrlFetchError('too-large', 'Reference image too large');
      }
      return {
        buffer: await readFile(localFile),
        contentType:
          IMAGE_MIME_BY_EXTENSION[extname(localFile).toLowerCase()] ??
          'application/octet-stream',
      };
    }

    return fetchPublicUrl(url, { maxBytes: MAX_REFERENCE_IMAGE_BYTES });
  }

  private ownUploadFile(url: string): string | null {
    const frontendUrl = process.env.FRONTEND_URL;
    const uploadDirectory = process.env.UPLOAD_DIRECTORY;
    if (
      (process.env.STORAGE_PROVIDER || 'local') !== 'local' ||
      !frontendUrl ||
      !uploadDirectory
    ) {
      return null;
    }

    try {
      if (new URL(url).origin !== new URL(frontendUrl).origin) {
        return null;
      }
    } catch {
      return null;
    }

    const segments = extractUploadPathSegments(url);
    if (!segments.length) {
      return null;
    }
    const file = resolveSafeUploadFile(uploadDirectory, segments);
    return file && IMAGE_MIME_BY_EXTENSION[extname(basename(file)).toLowerCase()]
      ? file
      : null;
  }

  private referenceImageError(err: unknown, url: string): HttpException {
    const reason = err instanceof PublicUrlFetchError ? err.reason : 'network';
    const status =
      err instanceof PublicUrlFetchError && err.status ? ` status=${err.status}` : '';
    let host = 'invalid-url';
    try {
      host = new URL(url).host;
    } catch {
      // mantem invalid-url
    }
    this._logger.warn(
      `Falha ao baixar reference image (host=${host} reason=${reason}${status})`
    );

    if (reason === 'unsafe') {
      return new HttpException(
        'A imagem de referencia precisa ser uma URL HTTPS publica.',
        400
      );
    }
    if (reason === 'too-large') {
      return new HttpException(
        'A imagem de referencia excede o limite de 25 MB.',
        400
      );
    }
    return new HttpException(
      'Nao foi possivel baixar a imagem de referencia.',
      502
    );
  }

  /**
   * I2I via OpenAI `/v1/images/edits`. Baixa a imagem de referencia,
   * monta multipart/form-data com `image`, `prompt`, `size`, `model`
   * e envia. `gpt-image-2` e o modelo recomendado (legacy DALL-E 2 ja
   * fora do catalogo). Mask nao e exposto nesta entrega.
   */
  private async generateOpenAiEdit(
    apiKey: string,
    model: string,
    prompt: string,
    referenceImageUrl: string,
    options: ImageOptions,
    aspectRatio: AiAspectRatio,
    baseURL?: string
  ): Promise<string> {
    // 1. Baixa a imagem de referencia. /v1/images/edits exige PNG/WebP;
    //    o usuario e responsavel por fornecer URL com formato compativel.
    //    A URL vem do usuario: HTTPS publica, dispatcher pinado e limite de
    //    bytes (`fetchPublicUrl`); o erro devolvido nao ecoa URL nem status.
    let reference: { buffer: Buffer; contentType: string };
    try {
      reference = await this.loadReferenceImage(referenceImageUrl);
    } catch (err) {
      throw this.referenceImageError(err, referenceImageUrl);
    }
    const { buffer, contentType } = reference;
    // so o nome do arquivo: a query (ex.: token de URL assinada) nao vai a OpenAI
    const filename =
      referenceImageUrl.split(/[?#]/)[0].split('/').pop() || 'reference.png';

    // 2. Monta o FormData. NOTA: /v1/images/edits NAO aceita o parametro
    //    `quality` (so /generations aceita) — enviar retorna 400
    //    "Unknown parameter: 'quality'". Por isso `quality` e omitido aqui
    //    mesmo quando configurado em Settings; aplica-se apenas em T2I.
    const size = ASPECT_TO_OPENAI_SIZE[aspectRatio];
    const form = new FormData();
    form.set('model', model);
    form.set('prompt', prompt);
    form.set('n', String(options.numImages ?? 1));
    form.set('size', size);
    form.set(
      'image',
      new Blob([new Uint8Array(buffer)], { type: contentType }),
      filename
    );

    // 3. POST. NAO setamos Content-Type: o fetch detecta o boundary do FormData.
    let res: Response;
    try {
      res = await fetch(`${(baseURL ?? 'https://api.openai.com/v1').replace(/\/$/, '')}/images/edits`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: form,
      });
    } catch (err) {
      this._logger.error(
        `OpenAI images.edits fetch falhou (network): ${(err as Error).message}`
      );
      throw new HttpException(
        `Falha de rede ao chamar OpenAI: ${(err as Error).message}`,
        502
      );
    }

    if (!res.ok) {
      const errBody = await res.text();
      this._logger.warn(
        `OpenAI images.edits retornou ${res.status}: ${errBody.slice(0, 200)}`
      );
      throw new HttpException(extractOpenAiError(errBody, res.status), 502);
    }

    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) {
      this._logger.warn(
        `OpenAI images.edits respondeu 200 mas sem b64_json (model=${model})`
      );
      throw new HttpException('OpenAI edit nao devolveu imagem.', 502);
    }
    return b64;
  }

  /**
   * OpenRouter chat completions com `modalities: ['image', 'text']`.
   *
   * - T2I: `messages[0].content` e string (prompt simples).
   * - I2I: `messages[0].content` e array `[text, image_url]` — modelos como
   *        Gemini Nano Banana, Flux fast etc aceitam imagem de referencia
   *        nesse formato e devolvem imagem nova respeitando o prompt.
   */
  private async generateOpenRouter(
    apiKey: string,
    model: string,
    prompt: string,
    options: ImageOptions,
    aspectRatio: AiAspectRatio,
    referenceImageUrl?: string
  ): Promise<string> {
    const imageConfig: Record<string, string> = {
      aspect_ratio: aspectRatio,
    };
    if (options.imageSize) {
      imageConfig.image_size = options.imageSize;
    }

    const userContent: unknown = referenceImageUrl
      ? [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: referenceImageUrl } },
        ]
      : prompt;

    const body: Record<string, unknown> = {
      model,
      messages: [{ role: 'user', content: userContent }],
      modalities: ['image', 'text'],
      image_config: imageConfig,
    };

    let res: Response;
    try {
      res = await fetch(OPENROUTER_CHAT_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      this._logger.error(
        `OpenRouter chat fetch falhou (network): ${(err as Error).message}`
      );
      throw new HttpException(
        `Falha de rede ao chamar OpenRouter: ${(err as Error).message}`,
        502
      );
    }

    if (!res.ok) {
      const errBody = await res.text();
      this._logger.warn(
        `OpenRouter chat retornou ${res.status}: ${errBody.slice(0, 200)}`
      );
      throw new HttpException(extractOpenRouterError(errBody, res.status), 502);
    }

    const json = (await res.json()) as {
      choices?: Array<{
        message?: {
          images?: Array<{ image_url?: { url?: string } }>;
        };
        finish_reason?: string;
      }>;
    };

    const choice = json?.choices?.[0];
    const url = choice?.message?.images?.[0]?.image_url?.url ?? '';
    if (!url) {
      this._logger.warn(
        `OpenRouter chat respondeu 200 mas sem image_url (model=${model} finish=${choice?.finish_reason ?? 'unknown'}). Verifique se o modelo selecionado realmente suporta image generation (modalities=image). Resposta: ${JSON.stringify(json).slice(0, 400)}`
      );
      throw new HttpException(
        'OpenRouter nao devolveu imagem. Provavelmente o modelo selecionado nao suporta image generation — verifique em Settings > Modelos de IA > Imagem.',
        502
      );
    }
    return url.replace(/^data:image\/[^;]+;base64,/, '');
  }
}
