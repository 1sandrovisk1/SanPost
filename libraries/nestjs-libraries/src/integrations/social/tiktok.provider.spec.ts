import { TiktokProvider } from './tiktok.provider';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';

jest.mock('@gitroom/helpers/utils/timer', () => ({
  timer: jest.fn(),
}));

describe('TiktokProvider - flags booleanas legadas', () => {
  it('normaliza strings antes de montar o payload do video', () => {
    const provider = new TiktokProvider();
    const payload = (provider as any).buildTikokPostInfoBody({
      message: 'Teste',
      media: [{ path: 'https://cdn.example/video.mp4' }],
      settings: {
        content_posting_method: 'DIRECT_POST',
        privacy_level: 'PUBLIC_TO_EVERYONE',
        duet: 'false',
        comment: 'false',
        stitch: 'true',
        video_made_with_ai: 'false',
        brand_content_toggle: 'false',
        brand_organic_toggle: 'true',
      },
    });

    expect(payload.post_info).toMatchObject({
      disable_duet: true,
      disable_comment: true,
      disable_stitch: false,
      is_aigc: false,
      brand_content_toggle: false,
      brand_organic_toggle: true,
    });
  });
});

// Lote de providers out/2026 — portes dos PRs upstream #1875, #2174, #2180,
// #2182 e #2186 (parte do provider nativo).
describe('TiktokProvider (lote out/2026)', () => {
  const statusBody = (ids: string) =>
    `{"data":{"status":"PUBLISH_COMPLETE","publicaly_available_post_id":${ids}},"error":{"code":"ok"}}`;
  const BIG_ID = '7345678901234567891'; // acima de 2^53: JSON.parse arredonda

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('picture_size_check_failed explica os limites reais de imagem e video', () => {
    const provider = new TiktokProvider();
    expect(
      provider.handleErrors('{"error":{"code":"picture_size_check_failed"}}')?.value
    ).toMatch(/images up to 1080px on the shorter side, videos at least 360px/);
  });

  it('DIRECT_POST de video envia video_cover_timestamp_ms em post_info (inclusive 0)', () => {
    const provider = new TiktokProvider();
    const post = {
      message: 'x',
      media: [{ path: 'https://cdn.example/v.mp4', thumbnailTimestamp: 0 }],
      settings: { content_posting_method: 'DIRECT_POST' },
    };
    expect(
      (provider as any).buildTikokPostInfoBody(post).post_info.video_cover_timestamp_ms
    ).toBe(0);
    expect(
      (provider as any).buildTikokSourceInfoBody(post).source_info
    ).not.toHaveProperty('video_cover_timestamp_ms');
  });

  it('foto ou video sem timestamp nao envia video_cover_timestamp_ms', () => {
    const provider = new TiktokProvider();
    const photo = {
      message: 'x',
      media: [{ path: 'https://cdn.example/a.jpg', thumbnailTimestamp: 1500 }],
      settings: { content_posting_method: 'DIRECT_POST' },
    };
    const video = {
      message: 'x',
      media: [{ path: 'https://cdn.example/v.mp4' }],
      settings: { content_posting_method: 'DIRECT_POST' },
    };
    expect(
      (provider as any).buildTikokPostInfoBody(photo).post_info
    ).not.toHaveProperty('video_cover_timestamp_ms');
    expect(
      (provider as any).buildTikokPostInfoBody(video).post_info
    ).not.toHaveProperty('video_cover_timestamp_ms');
  });

  it('id publico int64 e preservado como string ao concluir a publicacao', async () => {
    const provider = new TiktokProvider();
    jest
      .spyOn(provider, 'fetch')
      .mockResolvedValue({ text: async () => statusBody(`[${BIG_ID}]`) } as any);

    await expect(
      (provider as any).uploadedVideoSuccess('perfil', 'v_pub_file~abc', 'TOKEN')
    ).resolves.toEqual({
      url: `https://www.tiktok.com/@perfil/video/${BIG_ID}`,
      id: BIG_ID,
    });
  });

  it('id publico entre aspas tambem e aceito', async () => {
    const provider = new TiktokProvider();
    jest
      .spyOn(provider, 'fetch')
      .mockResolvedValue({ text: async () => statusBody(`["${BIG_ID}"]`) } as any);

    await expect(
      (provider as any).uploadedVideoSuccess('perfil', 'v_pub_file~abc', 'TOKEN')
    ).resolves.toMatchObject({ id: BIG_ID });
  });

  it('lista vazia de ids mantem o publish_id e a URL do perfil (resolveReleaseId corrige depois)', async () => {
    const provider = new TiktokProvider();
    jest
      .spyOn(provider, 'fetch')
      .mockResolvedValue({ text: async () => statusBody('[]') } as any);

    await expect(
      (provider as any).uploadedVideoSuccess('perfil', 'v_pub_file~abc', 'TOKEN')
    ).resolves.toEqual({
      url: 'https://www.tiktok.com/@perfil',
      id: 'v_pub_file~abc',
    });
  });

  it('resolveReleaseId resolve o publish_id pendente via analyticsFetch e devolve id + URL', async () => {
    const provider = new TiktokProvider();
    const fetchSpy = jest.spyOn(provider, 'fetch');
    const safe = jest
      .spyOn(provider as any, 'analyticsFetch')
      .mockResolvedValue({ text: async () => statusBody(`[${BIG_ID}]`) } as any);

    await expect(
      provider.resolveReleaseId('TOKEN', 'v_pub_url~abc', { profile: 'perfil' } as any)
    ).resolves.toEqual({
      postId: BIG_ID,
      releaseURL: `https://www.tiktok.com/@perfil/video/${BIG_ID}`,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(String(safe.mock.calls[0][0])).toContain('/post/publish/status/fetch/');
  });

  it('resolveReleaseId ignora ids que nao sao publish_id e devolve undefined sem id publico', async () => {
    const provider = new TiktokProvider();
    const safe = jest
      .spyOn(provider as any, 'analyticsFetch')
      .mockResolvedValue({ text: async () => statusBody('[]') } as any);

    await expect(
      provider.resolveReleaseId('TOKEN', BIG_ID, { profile: 'perfil' } as any)
    ).resolves.toBeUndefined();
    expect(safe).not.toHaveBeenCalled();

    await expect(
      provider.resolveReleaseId('TOKEN', 'v_pub_url~abc', { profile: 'perfil' } as any)
    ).resolves.toBeUndefined();
    expect(safe).toHaveBeenCalledTimes(1);
  });

  it('postAnalytics com publish_id ainda nao resolvido devolve vazio sem consultar o video', async () => {
    const provider = new TiktokProvider();
    const safe = jest.spyOn(provider as any, 'analyticsFetch');

    await expect(
      provider.postAnalytics('user-1', 'TOKEN', 'v_pub_url~abc', 7)
    ).resolves.toEqual([]);
    expect(safe).not.toHaveBeenCalled();
  });

  it('FAILED encerra o polling com BadBody e a mensagem curada', async () => {
    const provider = new TiktokProvider();
    jest.spyOn(provider, 'fetch').mockResolvedValue({
      text: async () =>
        '{"data":{"status":"FAILED","fail_reason":"picture_size_check_failed"},"error":{"code":"ok"}}',
    } as any);

    const posting = (provider as any).uploadedVideoSuccess('perfil', 'v_pub_file~abc', 'TOKEN');
    await expect(posting).rejects.toBeInstanceOf(BadBody);
    await expect(posting).rejects.toThrow(/images up to 1080px on the shorter side/);
  });

  it('SEND_TO_USER_INBOX devolve id missing e a URL da caixa de entrada', async () => {
    const provider = new TiktokProvider();
    jest.spyOn(provider, 'fetch').mockResolvedValue({
      text: async () => '{"data":{"status":"SEND_TO_USER_INBOX"}}',
    } as any);

    await expect(
      (provider as any).uploadedVideoSuccess('perfil', 'v_pub_file~abc', 'TOKEN')
    ).resolves.toEqual({ url: 'https://www.tiktok.com/messages?lang=en', id: 'missing' });
  });

  it('corpo que nao e JSON (ou sem data) falha rapido em vez de girar', async () => {
    const provider = new TiktokProvider();
    const fetchSpy = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValue({ text: async () => '<html>maintenance</html>' } as any);

    await expect(
      (provider as any).uploadedVideoSuccess('perfil', 'v_pub_file~abc', 'TOKEN')
    ).rejects.toThrow(/Unexpected response from TikTok/);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('polling e limitado: sem conclusao apos 90 tentativas falha com BadBody', async () => {
    const provider = new TiktokProvider();
    const fetchSpy = jest.spyOn(provider, 'fetch').mockResolvedValue({
      text: async () => '{"data":{"status":"PROCESSING_DOWNLOAD"}}',
    } as any);

    await expect(
      (provider as any).uploadedVideoSuccess('perfil', 'v_pub_file~abc', 'TOKEN')
    ).rejects.toThrow(/did not confirm the publication in time/);
    expect(fetchSpy).toHaveBeenCalledTimes(90);
  });

  it('id mal formado ([7.3e18]) nao e aceito: cai no publish_id', async () => {
    const provider = new TiktokProvider();
    jest
      .spyOn(provider, 'fetch')
      .mockResolvedValue({ text: async () => statusBody('[7.3e18]') } as any);

    await expect(
      (provider as any).uploadedVideoSuccess('perfil', 'v_pub_file~abc', 'TOKEN')
    ).resolves.toMatchObject({ id: 'v_pub_file~abc' });
  });

  it('resolveReleaseId sem perfil na integracao nao resolve (URL ficaria /@null/)', async () => {
    const provider = new TiktokProvider();
    jest
      .spyOn(provider as any, 'analyticsFetch')
      .mockResolvedValue({ text: async () => statusBody(`[${BIG_ID}]`) } as any);

    await expect(
      provider.resolveReleaseId('TOKEN', 'v_pub_url~abc', { profile: null } as any)
    ).resolves.toBeUndefined();
  });

  it('refreshToken usa as credenciais do perfil (ClientInformation) e cai no env sem elas', async () => {
    const provider = new TiktokProvider();
    const originalFetch = global.fetch;
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        json: async () => ({ access_token: 'NEW', refresh_token: 'R2' }),
      })
      .mockResolvedValueOnce({
        json: async () => ({
          data: { user: { avatar_url: '', display_name: 'n', open_id: 'a-b', username: 'u' } },
        }),
      });
    global.fetch = fetchMock as any;
    try {
      await provider.refreshToken('R1', {
        client_id: 'profile-key',
        client_secret: 'profile-secret',
        instanceUrl: '',
      });
    } finally {
      global.fetch = originalFetch;
    }

    const body = String(fetchMock.mock.calls[0][1].body);
    expect(body).toContain('client_key=profile-key');
    expect(body).toContain('client_secret=profile-secret');
  });
});
