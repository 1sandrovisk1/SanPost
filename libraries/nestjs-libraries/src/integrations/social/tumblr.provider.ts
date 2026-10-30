import { Rules } from '../../chat/rules.description.decorator';
import {
  AuthTokenDetails,
  ClientInformation,
  PostDetails,
  PostResponse,
  SocialProvider,
} from './social.integrations.interface';
import { BadBody, RefreshToken, SocialAbstract } from '../social.abstract';
import { makeSecureId } from '../../services/make.secure.id';
import { TumblrDto } from '../../dtos/posts/providers-settings/tumblr.dto';
import { DashboardFunction } from '../dashboard.function.decorator';
import { Integration } from '@prisma/client';
import { ssrfSafeFetch } from '../../dtos/webhooks/ssrf.safe.dispatcher';
import { readResponseBodyWithLimit } from '../../upload/bounded.response.reader';
import { fetchPublicUrl } from '../../upload/public-url.fetch';
import {
  resolveSafeUploadFile,
  extractUploadPathSegments,
} from '../../upload/safe.upload.path';
import { socialMutationOnce } from './mutation.once';
import { readFile, stat } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import FormData from 'form-data';
import sharp from 'sharp';
import { lookup } from 'mime-types';

const API = 'https://api.tumblr.com/v2';
const UA = 'RoboMultipost/1.0 (+https://github.com/maiconramos/robo-multipost)';
const MAX_MEDIA = 100 * 1024 * 1024;
@Rules(
  'Tumblr publishes one NPF post, not a thread. Up to 30 images and one MP4 video; images at most 20 MB each, combined media at most 100 MB. Optional title, link, sourceUrl and comma-separated tags. Use uploaded media from the library. Links need full HTTP(S) URLs.'
)
export class TumblrProvider extends SocialAbstract implements SocialProvider {
  // Keep the fork default concurrency of one: each post can buffer up to 100 MB.
  identifier = 'tumblr';
  name = 'Tumblr';
  isBetweenSteps = true;
  editor = 'normal' as const;
  dto = TumblrDto;
  scopes = ['basic', 'write', 'offline_access'];
  maxLength() {
    return 32768;
  }
  private fail(message: string): never {
    throw new BadBody(this.identifier, '{}', '{}', message);
  }
  override handleErrors(
    body: string,
    status?: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    if (status === 401 || /invalid_token|invalid_grant/.test(body))
      return { type: 'refresh-token', value: 'Reconecte sua conta do Tumblr.' };
    if (status === 429)
      return {
        type: 'bad-body',
        value:
          'Limite de requisições do Tumblr atingido. Tente novamente mais tarde.',
      };
    return undefined;
  }
  private credentials(info?: ClientInformation) {
    const clientId = info ? info.client_id : process.env.TUMBLR_CLIENT_ID;
    const clientSecret = info
      ? info.client_secret
      : process.env.TUMBLR_CLIENT_SECRET;
    if (!clientId || !clientSecret)
      this.fail('Configure as credenciais do aplicativo Tumblr neste perfil.');
    return { client_id: clientId!, client_secret: clientSecret! };
  }
  private redirectUri() {
    return `${process.env.FRONTEND_URL}/integrations/social/tumblr`;
  }
  async generateAuthUrl(info?: ClientInformation) {
    const credentials = this.credentials(info);
    const state = makeSecureId(32);
    const params = new URLSearchParams({
      client_id: credentials.client_id,
      response_type: 'code',
      scope: this.scopes.join(' '),
      state,
      redirect_uri: this.redirectUri(),
    });
    return {
      url: `https://www.tumblr.com/oauth2/authorize?${params}`,
      state,
      codeVerifier: makeSecureId(32),
    };
  }
  private async request(
    path: string,
    token?: string,
    body?: URLSearchParams
  ): Promise<any> {
    let response: Response;
    let data: any;
    try {
      response = await ssrfSafeFetch(API + path, {
        method: body ? 'POST' : 'GET',
        headers: {
          'User-Agent': UA,
          ...(body
            ? { 'Content-Type': 'application/x-www-form-urlencoded' }
            : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: body.toString() } : {}),
        signal: AbortSignal.timeout(20_000),
      });
      data = JSON.parse(
        (await readResponseBodyWithLimit(response, 256 * 1024)).toString('utf8')
      );
    } catch {
      return this.fail(
        'Tumblr não respondeu corretamente. Tente novamente a conexão.'
      );
    }
    if (
      !response!.ok ||
      data?.meta?.status >= 400 ||
      data?.error ||
      data?.errors
    )
      return this.fail(
        'Tumblr recusou a solicitação. Confira o acesso do aplicativo e reconecte a conta.'
      );
    return data;
  }
  private async token(
    params: Record<string, string>,
    info?: ClientInformation
  ) {
    const result = await this.request(
      '/oauth2/token',
      undefined,
      new URLSearchParams({ ...params, ...this.credentials(info) })
    );
    if (!result?.access_token || !Number.isFinite(Number(result.expires_in)))
      this.fail('Tumblr não retornou um token válido.');
    return result;
  }
  private async identity(
    token: any,
    previousRefresh = ''
  ): Promise<AuthTokenDetails> {
    const data = await this.request('/user/info', token.access_token);
    const user = data?.response?.user;
    if (!user?.name) this.fail('Tumblr não retornou a conta autorizada.');
    const blog =
      (user.blogs || []).find((b: any) => b.primary) || (user.blogs || [])[0];
    return {
      id: user.name,
      name: user.name,
      accessToken: token.access_token,
      refreshToken: token.refresh_token || previousRefresh,
      expiresIn: Number(token.expires_in),
      picture: blog ? this.avatar(blog.name) : '',
      username: user.name,
    };
  }
  async authenticate(
    params: { code: string; codeVerifier: string; refresh?: string },
    info?: ClientInformation
  ) {
    const token = await this.token(
      {
        grant_type: 'authorization_code',
        code: params.code,
        redirect_uri: this.redirectUri(),
      },
      info
    );
    if (token.scope) this.checkScopes(this.scopes, token.scope);
    return this.identity(token);
  }
  async refreshToken(refreshToken: string, info?: ClientInformation) {
    return this.identity(
      await this.token(
        { grant_type: 'refresh_token', refresh_token: refreshToken },
        info
      ),
      refreshToken
    );
  }
  private avatar(name: string) {
    return `${API}/blog/${encodeURIComponent(name + '.tumblr.com')}/avatar/128`;
  }
  @DashboardFunction()
  async pages(accessToken: string) {
    const data = await this.request('/user/info', accessToken);
    if (!Array.isArray(data?.response?.user?.blogs))
      this.fail('Tumblr não retornou os blogs desta conta.');
    return data.response.user.blogs
      .filter(
        (b: any) => typeof b.name === 'string' && /^[a-z0-9-]+$/i.test(b.name)
      )
      .map((b: any) => ({
        id: b.name,
        name: b.title || b.name,
        username: `https://${b.name}.tumblr.com`,
        picture: { data: { url: this.avatar(b.name) } },
        primary: !!b.primary,
      }));
  }
  async fetchPageInformation(accessToken: string, data: { id: string }) {
    const blog = (await this.pages(accessToken)).find(
      (b: any) => b.id === data?.id
    );
    if (!blog)
      this.fail('Este blog do Tumblr não pertence à conta autorizada.');
    return {
      id: blog.id,
      name: blog.name,
      access_token: accessToken,
      picture: blog.picture.data.url,
      username: blog.username,
    };
  }
  async reConnect(_id: string, requiredId: string, accessToken: string) {
    const b = await this.fetchPageInformation(accessToken, { id: requiredId });
    return {
      id: b.id,
      name: b.name,
      accessToken: b.access_token,
      picture: b.picture,
      username: b.username,
    };
  }
  private async loadMedia(
    path: string,
    maxBytes: number,
    deadline: number
  ): Promise<Buffer> {
    try {
      if (Date.now() > deadline) throw new Error('deadline');
      const base = process.env.UPLOAD_DIRECTORY || '';
      let local: string | null = null;
      if (/^https?:\/\//i.test(path)) {
        const url = new URL(path);
        const front = process.env.FRONTEND_URL
          ? new URL(process.env.FRONTEND_URL)
          : undefined;
        if (
          front &&
          url.origin === front.origin &&
          url.pathname.startsWith('/uploads/')
        )
          local = resolveSafeUploadFile(base, extractUploadPathSegments(path));
        else {
          const result = await fetchPublicUrl(path, { maxBytes });
          if (Date.now() > deadline) throw new Error('deadline');
          return result.buffer;
        }
      } else if (base) {
        const absolute = resolve(path);
        local = resolveSafeUploadFile(
          base,
          relative(resolve(base), absolute).split(sep)
        );
      }
      if (!local) throw new Error('outside');
      const size = (await stat(local)).size;
      if (size > maxBytes) throw new Error('size');
      const buffer = await readFile(local);
      if (buffer.length > maxBytes || Date.now() > deadline)
        throw new Error('size');
      return buffer;
    } catch {
      return this.fail(
        'A mídia do Tumblr está inacessível, excede o limite ou não pertence ao diretório de uploads.'
      );
    }
  }
  async post(
    id: string,
    accessToken: string,
    posts: PostDetails<TumblrDto>[],
    _integration: Integration
  ): Promise<PostResponse[]> {
    if (posts.length !== 1)
      this.fail(
        'Tumblr aceita uma publicação por envio, sem comentários encadeados.'
      );
    const post = posts[0];
    if (!post || !id || !/^[a-z0-9-]+$/i.test(id))
      this.fail('Blog do Tumblr inválido.');
    const media = post.media || [];
    if (
      media.filter((m) => !/\.mp4(?:$|[?#])/i.test(m.path)).length > 30 ||
      media.filter((m) => /\.mp4(?:$|[?#])/i.test(m.path)).length > 1
    )
      this.fail('Tumblr aceita até 30 imagens e um vídeo por publicação.');
    const blocks: any[] = [];
    const settings = post.settings || {};
    if (settings.title)
      blocks.push({ type: 'text', subtype: 'heading1', text: settings.title });
    for (const paragraph of (post.message || '')
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)) {
      const points = Array.from(paragraph);
      for (let start = 0; start < points.length; start += 4096)
        blocks.push({
          type: 'text',
          text: points.slice(start, start + 4096).join(''),
        });
    }
    if (settings.link)
      blocks.push({ type: 'link', url: this.httpUrl(settings.link) });
    const loaded: Array<{ buffer: Buffer; type: string; name: string }> = [];
    let used = 0;
    const deadline = Date.now() + 90_000;
    for (const [index, item] of media.entries()) {
      const type = lookup(item.path.split(/[?#]/)[0]);
      const video = type === 'video/mp4';
      if (
        !type ||
        (!video &&
          !['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(
            type
          ))
      )
        this.fail('Formato de mídia não suportado pelo Tumblr.');
      const buffer = await this.loadMedia(
        item.path,
        Math.min(video ? MAX_MEDIA : 20 * 1024 * 1024, MAX_MEDIA - used),
        deadline
      );
      used += buffer.length;
      loaded.push({ buffer, type: type as string, name: `media-${index}` });
      const uploaded: any = {
        type,
        identifier: `media-${index}`,
        width: 540,
        height: 405,
      };
      if (!video) {
        let metadata;
        try {
          metadata = await sharp(buffer, {
            limitInputPixels: 100_000_000,
          }).metadata();
        } catch {
          this.fail('Imagem inválida para o Tumblr.');
        }
        if (!metadata!.width || !metadata!.height)
          this.fail('Imagem inválida para o Tumblr.');
        uploaded.width = metadata!.width;
        uploaded.height = metadata!.height;
      }
      blocks.push(
        video
          ? { type: 'video', provider: 'tumblr', media: uploaded }
          : {
              type: 'image',
              media: [uploaded],
              ...(item.alt ? { alt_text: item.alt } : {}),
            }
      );
    }
    if (!blocks.length)
      this.fail('Inclua texto, link ou mídia na publicação do Tumblr.');
    const payload = {
      content: blocks,
      state: 'published',
      ...(settings.tags ? { tags: settings.tags } : {}),
      ...(settings.sourceUrl
        ? { source_url: this.httpUrl(settings.sourceUrl) }
        : {}),
    };
    let body: any;
    let status: number;
    let ok: boolean;
    const url = `${API}/blog/${encodeURIComponent(id)}/posts`;
    if (!loaded.length) {
      ({ body, status, ok } = await socialMutationOnce(this.identifier, url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': UA,
        },
        body: JSON.stringify(payload),
      }));
    } else {
      const form = new FormData();
      form.append('json', JSON.stringify(payload), {
        contentType: 'application/json',
      });
      for (const m of loaded)
        form.append(m.name, m.buffer, {
          filename: m.name,
          contentType: m.type,
          knownLength: m.buffer.length,
        });
      try {
        const result = await this.getSsrfSafeAxios().post(url, form, {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': UA,
          },
          validateStatus: () => true,
          maxRedirects: 0,
          timeout: 60_000,
          signal: AbortSignal.timeout(60_000),
          maxBodyLength: MAX_MEDIA + 1024 * 1024,
          maxContentLength: 128 * 1024,
        });
        body = result.data;
        status = result.status;
        ok = status >= 200 && status < 300;
      } catch {
        return this.fail(
          'Não foi possível confirmar a publicação do Tumblr. Confira o blog antes de tentar novamente.'
        );
      }
    }
    if (status === 401)
      throw new RefreshToken(
        this.identifier,
        '{}',
        '{}',
        'Reconecte sua conta do Tumblr.'
      );
    if (!ok || body?.meta?.status >= 400 || body?.error || body?.errors)
      this.fail(
        'Tumblr não confirmou a publicação. Confira o blog antes de tentar novamente.'
      );
    const result = body?.response;
    const rawId = result?.id_string || result?.post_id || result?.id;
    if (
      !rawId ||
      (typeof rawId === 'number' && !Number.isSafeInteger(rawId)) ||
      !/^\d+$/.test(String(rawId))
    )
      this.fail(
        'Tumblr não retornou um identificador válido. Confira o blog antes de tentar novamente.'
      );
    const postId = String(rawId);
    return [
      {
        id: post.id,
        postId,
        status: 'completed',
        releaseURL: `https://${id}.tumblr.com/post/${postId}`,
      },
    ];
  }
  private httpUrl(value: string) {
    try {
      const u = new URL(value);
      if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password)
        throw new Error();
      return u.toString();
    } catch {
      return this.fail('Use um link HTTP ou HTTPS válido.');
    }
  }
}
