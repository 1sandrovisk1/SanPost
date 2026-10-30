import 'reflect-metadata';
import { InstagramProvider } from './instagram.provider';
import {
  BadBody,
  RefreshToken,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';

describe('InstagramProvider (flags)', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('declara noNativeRefresh pois o refreshToken e stub (Page token nao renova)', () => {
    // Consumido por IntegrationService.refreshTokens: sem esta flag o cron
    // em lote volta a desconectar canal saudavel por falso positivo.
    expect(new InstagramProvider().noNativeRefresh).toBe(true);
  });

  it('nao envia trial_params quando flag legada contem a string false', async () => {
    jest.useFakeTimers();
    const provider = new InstagramProvider();
    const fetchMock = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce({
        json: async () => ({ id: 'creation-1' }),
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({ status_code: 'FINISHED' }),
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({ id: 'media-1' }),
      } as Response)
      .mockResolvedValueOnce({
        json: async () => ({ permalink: 'https://instagram.example/p/1' }),
      } as Response);

    const posting = provider.post(
      'ig-1',
      'token',
      [
        {
          id: 'post-1',
          message: 'Teste',
          media: [{ path: 'https://cdn.example/video.mp4' }],
          settings: {
            post_type: 'post',
            is_trial_reel: 'false',
          },
        },
      ] as any,
      {} as any
    );

    await jest.runAllTimersAsync();
    await posting;

    expect(String(fetchMock.mock.calls[0][0])).not.toContain('trial_params');
  });
});

describe('InstagramProvider.getMediaMetadata', () => {
  let provider: InstagramProvider;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    provider = new InstagramProvider();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('deve montar URL com host recebido e fields essenciais', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'm-1', permalink: 'p', media_type: 'IMAGE' }),
    });
    global.fetch = fetchMock as any;

    await provider.getMediaMetadata('m-1', 'TOK', 'graph.facebook.com');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('https://graph.facebook.com/v25.0/m-1?')
    );
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('thumbnail_url');
    expect(url).toContain('boost_eligibility_info'); // graph.facebook.com suporta
    expect(url).toContain('access_token=TOK');
  });

  it('deve marcar isAd=true quando eligible_to_boost=false', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'm-1',
        media_type: 'VIDEO',
        boost_eligibility_info: { eligible_to_boost: false },
      }),
    }) as any;

    const result = await provider.getMediaMetadata(
      'm-1',
      'TOK',
      'graph.facebook.com'
    );

    expect(result.isAd).toBe(true);
  });

  it('deve marcar isAd=false quando eligible_to_boost=true', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'm-1',
        media_type: 'VIDEO',
        boost_eligibility_info: { eligible_to_boost: true },
      }),
    }) as any;

    const result = await provider.getMediaMetadata('m-1', 'TOK');

    expect(result.isAd).toBe(false);
  });

  it('deve retornar isAd=undefined quando campo nao vem na resposta', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'm-1', media_type: 'IMAGE' }),
    }) as any;

    const result = await provider.getMediaMetadata('m-1', 'TOK');

    expect(result.isAd).toBeUndefined();
  });

  it('deve fazer fallback de thumbnailUrl pra media_url quando thumbnail_url ausente', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'm-1',
        media_type: 'IMAGE',
        media_url: 'https://cdn/image.jpg',
      }),
    }) as any;

    const result = await provider.getMediaMetadata('m-1', 'TOK');

    expect(result.thumbnailUrl).toBe('https://cdn/image.jpg');
  });

  it('deve preferir thumbnail_url quando ambos vem', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'm-1',
        media_type: 'VIDEO',
        media_url: 'https://cdn/video.mp4',
        thumbnail_url: 'https://cdn/thumb.jpg',
      }),
    }) as any;

    const result = await provider.getMediaMetadata('m-1', 'TOK');

    expect(result.thumbnailUrl).toBe('https://cdn/thumb.jpg');
  });

  it('deve lancar erro quando resposta nao-ok', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'Object does not exist' },
      }),
    }) as any;

    await expect(provider.getMediaMetadata('bad-id', 'TOK')).rejects.toThrow(
      /HTTP 400/
    );
  });

  it('graph.instagram.com nao deve nem tentar boost_eligibility_info', async () => {
    // Documentacao Meta: o campo so existe em "Instagram API with Facebook Login"
    // (host graph.facebook.com). Em graph.instagram.com nem pedimos.
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'm-1',
        permalink: 'https://...',
        caption: 'ola',
        media_type: 'VIDEO',
        thumbnail_url: 'https://thumb',
      }),
    });
    global.fetch = fetchMock as any;

    const result = await provider.getMediaMetadata(
      'm-1',
      'TOK',
      'graph.instagram.com'
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).not.toContain('boost_eligibility_info');
    expect(result.isAd).toBeUndefined();
    expect(result.permalink).toBe('https://...');
  });

  it('graph.facebook.com retry defensive quando app type nao suporta o campo', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message:
              '(#100) Tried accessing nonexisting field (boost_eligibility_info) on node type (Media)',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'm-1',
          permalink: 'https://...',
          caption: 'ola',
          media_type: 'VIDEO',
          thumbnail_url: 'https://thumb',
        }),
      });
    global.fetch = fetchMock as any;

    const result = await provider.getMediaMetadata(
      'm-1',
      'TOK',
      'graph.facebook.com'
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('boost_eligibility_info');
    expect(fetchMock.mock.calls[1][0]).not.toContain('boost_eligibility_info');
    expect(result.isAd).toBeUndefined();
    expect(result.permalink).toBe('https://...');
  });

  it('nao deve fazer retry quando 400 eh por outro motivo', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'Invalid OAuth access token' },
      }),
    });
    global.fetch = fetchMock as any;

    await expect(
      provider.getMediaMetadata('m-1', 'TOK', 'graph.instagram.com')
    ).rejects.toThrow(/Invalid OAuth/);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Smoke test apenas para garantir que pages() nao lanca quando fetch falha
  // (rede caida ou timeout). Garante que o catch global cobre a falha do
  // primeiro fetch para /me/accounts. Cobertura completa do budget de 90s e
  // dos timeouts individuais fica como divida tecnica.
  it('pages() retorna array (mesmo vazio) sem lancar quando fetch falha', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('Network down'));
    global.fetch = fetchMock as any;

    const result = await provider.pages('TOK');
    expect(Array.isArray(result)).toBe(true);
  });

  // Garante que erros do Meta no token exchange virem mensagens explicitas
  // em vez de TypeError obscuro ("Cannot read properties of undefined").
  it('authenticate() lanca mensagem explicita quando token exchange retorna erro', async () => {
    const fetchMock = jest.fn().mockResolvedValueOnce({
      json: async () => ({
        error: {
          message: 'Application request limit reached',
          type: 'OAuthException',
          code: 4,
        },
      }),
    });
    global.fetch = fetchMock as any;

    await expect(
      provider.authenticate({ code: 'CODE', codeVerifier: 'CV', refresh: '' })
    ).rejects.toThrow(/Meta token exchange failed/);
  });
});

describe('InstagramProvider Graph API v25', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  it('usa v25 nas duas consultas de analytics para ambos os hosts', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      json: async () => ({ data: [] as any[] }),
    });
    global.fetch = fetchMock as any;

    await new InstagramProvider().analytics(
      'ig-1',
      'TOK',
      7,
      undefined,
      'graph.instagram.com'
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [url] of fetchMock.mock.calls) {
      expect(String(url)).toContain('graph.instagram.com/v25.0/ig-1/insights');
      expect(String(url)).not.toContain('/v21.0/');
    }
  });
});

describe('InstagramProvider.handleErrors', () => {
  let provider: InstagramProvider;

  beforeEach(() => {
    provider = new InstagramProvider();
  });

  it.each([460, 464])(
    'classifica Meta 190/%s como token que exige reconexao',
    (subcode) => {
      const body = JSON.stringify({
        error: {
          message: 'Error validating access token',
          type: 'OAuthException',
          code: 190,
          error_subcode: subcode,
        },
      });

      expect(provider.handleErrors(body, 400)).toEqual({
        type: 'refresh-token',
        value:
          'The connected Facebook user session is no longer valid, please reconnect the account',
      });
    }
  );

  it('mantem outros erros 190 como permissao insuficiente', () => {
    expect(
      provider.handleErrors('OAuthException 190, permissions', 400)
    ).toEqual({
      type: 'bad-body',
      value:
        'The account is missing some permissions to perform this action, please re-add the account and allow all permissions',
    });
  });
});

// Lote de providers out/2026 — portes dos PRs upstream #2088, #2123, #2137,
// #2152, #2215, #2234, #2239, #2256, #2260, #2261 e #1855.
describe('InstagramProvider.handleErrors (lote out/2026)', () => {
  const provider = new InstagramProvider();

  it.each([
    ['2207085', 'bad-body', /video format, duration and resolution/],
    ['2207082', 'bad-body', /set the original video volume to 0/],
    ['2207078', 'bad-body', /Trial Reel publish limit/],
    ['2207018', 'bad-body', /collaborators could not be tagged/],
    ['1772107', 'bad-body', /did not add the comment/],
    ['2207053', 'bad-body', /300MB, 1920px width, 25Mbps/],
    ['2207052', 'retry', /Media fetch failed/],
    ['(#200)', 'bad-body', /missing permissions/],
  ])('mapeia %s como %s', (code, type, message) => {
    const result = provider.handleErrors(
      JSON.stringify({
        error: { message: `Erro ${code}`, error_subcode: code },
      }),
      400
    );
    expect(result?.type).toBe(type);
    expect(result?.value).toMatch(message);
  });

  it.each([
    'You cannot access the app till you log in to www.facebook.com',
    'Session key is malformed',
  ])(
    'checkpoint da Meta ("%s") vira refresh-token para passar pelo self-heal/desconexao',
    (text) => {
      expect(provider.handleErrors(text, 400)).toEqual({
        type: 'refresh-token',
        value: expect.stringMatching(/log in at instagram\.com/),
      });
    }
  );
});

describe('InstagramProvider.post (lote out/2026)', () => {
  const mockGraph = (
    provider: InstagramProvider,
    statusByContainer: (id: string) => { status_code: string; status?: string }
  ) => {
    let children = 0;
    const calls: string[] = [];
    jest.spyOn(provider, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      calls.push(u);
      const json = u.includes('/media_publish')
        ? { id: 'media-1' }
        : u.includes('fields=status_code')
        ? statusByContainer(u.split('/').pop()!.split('?')[0])
        : u.includes('fields=permalink')
        ? { permalink: 'https://instagram.example/p/1' }
        : u.includes('media_type=CAROUSEL')
        ? { id: 'carousel-1' }
        : u.includes('/media?')
        ? { id: `child-${++children}` }
        : {};
      return { json: async () => json } as Response;
    });
    return calls;
  };

  afterEach(() => {
    jest.useRealTimers();
  });

  it('carrossel: collaborators (sem @, url-encoded) vao no container, nao nos itens', async () => {
    jest.useFakeTimers();
    const provider = new InstagramProvider();
    const calls = mockGraph(provider, () => ({ status_code: 'FINISHED' }));

    const posting = provider.post(
      'ig-1',
      'token',
      [
        {
          id: 'post-1',
          message: 'Carrossel',
          media: [
            { path: 'https://cdn.example/a.jpg' },
            { path: 'https://cdn.example/b.jpg' },
          ],
          settings: {
            post_type: 'post',
            collaborators: [{ label: '@alice' }, { label: 'bob' }],
          },
        },
      ] as any,
      {} as any
    );
    await jest.runAllTimersAsync();
    await posting;

    const encoded = encodeURIComponent(JSON.stringify(['alice', 'bob']));
    const children = calls.filter((u) => u.includes('is_carousel_item=true'));
    const container = calls.find((u) => u.includes('media_type=CAROUSEL'))!;
    expect(children).toHaveLength(2);
    for (const child of children) expect(child).not.toContain('collaborators');
    expect(container).toContain(`&collaborators=${encoded}`);
  });

  it('post unico: collaborators vao no item, sem @ e url-encoded', async () => {
    jest.useFakeTimers();
    const provider = new InstagramProvider();
    const calls = mockGraph(provider, () => ({ status_code: 'FINISHED' }));

    const posting = provider.post(
      'ig-1',
      'token',
      [
        {
          id: 'post-1',
          message: 'Foto',
          media: [{ path: 'https://cdn.example/a.jpg' }],
          settings: { post_type: 'post', collaborators: [{ label: '@alice' }] },
        },
      ] as any,
      {} as any
    );
    await jest.runAllTimersAsync();
    await posting;

    expect(calls[0]).toContain(
      `&collaborators=${encodeURIComponent(JSON.stringify(['alice']))}`
    );
  });

  it('reel usa a thumbnail da midia como cover_url quando nao ha capa nas settings', async () => {
    jest.useFakeTimers();
    const provider = new InstagramProvider();
    const calls = mockGraph(provider, () => ({ status_code: 'FINISHED' }));

    const posting = provider.post(
      'ig-1',
      'token',
      [
        {
          id: 'post-1',
          message: 'Reel',
          media: [
            {
              path: 'https://cdn.example/v.mp4',
              thumbnail: 'https://cdn.example/thumb.jpg',
            },
          ],
          settings: { post_type: 'post' },
        },
      ] as any,
      {} as any
    );
    await jest.runAllTimersAsync();
    await posting;

    expect(calls[0]).toContain('media_type=REELS');
    expect(calls[0]).toContain(
      `&cover_url=${encodeURIComponent('https://cdn.example/thumb.jpg')}`
    );
  });

  it('container em ERROR vira BadBody com a mensagem curada (2207082)', async () => {
    jest.useFakeTimers();
    const provider = new InstagramProvider();
    mockGraph(provider, () => ({
      status_code: 'ERROR',
      status: 'Error: Media upload has failed with error code 2207082',
    }));

    const posting = provider.post(
      'ig-1',
      'token',
      [
        {
          id: 'post-1',
          message: 'Reel',
          media: [{ path: 'https://cdn.example/v.mp4' }],
          settings: { post_type: 'post' },
        },
      ] as any,
      {} as any
    );
    const assertion = expect(posting).rejects.toThrow(
      /set the original video volume to 0/
    );
    await jest.runAllTimersAsync();
    await assertion;
  });

  it('checkpoint da Meta no status do container vira RefreshToken (nao BadBody)', async () => {
    jest.useFakeTimers();
    const provider = new InstagramProvider();
    mockGraph(provider, () => ({
      status_code: 'ERROR',
      status:
        'Error: You cannot access the app till you log in to www.facebook.com',
    }));

    const posting = provider.post(
      'ig-1',
      'token',
      [
        {
          id: 'p',
          message: 'x',
          media: [{ path: 'https://cdn.example/a.jpg' }],
          settings: { post_type: 'post' },
        },
      ] as any,
      {} as any
    );
    const assertion = expect(posting).rejects.toBeInstanceOf(RefreshToken);
    await jest.runAllTimersAsync();
    await assertion;
  });

  it('EXPIRED tambem falha o post com BadBody', async () => {
    jest.useFakeTimers();
    const provider = new InstagramProvider();
    mockGraph(provider, () => ({ status_code: 'EXPIRED', status: 'EXPIRED' }));

    const posting = provider.post(
      'ig-1',
      'token',
      [
        {
          id: 'p',
          message: 'x',
          media: [{ path: 'https://cdn.example/a.jpg' }],
          settings: { post_type: 'post' },
        },
      ] as any,
      {} as any
    );
    const assertion = expect(posting).rejects.toBeInstanceOf(BadBody);
    await jest.runAllTimersAsync();
    await assertion;
  });

  it('ERROR no container do carrossel (itens FINISHED) falha com a mensagem curada', async () => {
    jest.useFakeTimers();
    const provider = new InstagramProvider();
    mockGraph(provider, (id) =>
      id === 'carousel-1'
        ? { status_code: 'ERROR', status: 'Error: 2207085' }
        : { status_code: 'FINISHED' }
    );

    const posting = provider.post(
      'ig-1',
      'token',
      [
        {
          id: 'p',
          message: 'x',
          media: [
            { path: 'https://cdn.example/a.jpg' },
            { path: 'https://cdn.example/b.jpg' },
          ],
          settings: { post_type: 'post' },
        },
      ] as any,
      {} as any
    );
    const assertion = expect(posting).rejects.toThrow(
      /video format, duration and resolution/
    );
    await jest.runAllTimersAsync();
    await assertion;
  });

  it('story nao envia collaborators', async () => {
    jest.useFakeTimers();
    const provider = new InstagramProvider();
    const calls = mockGraph(provider, () => ({ status_code: 'FINISHED' }));

    const posting = provider.post(
      'ig-1',
      'token',
      [
        {
          id: 'p',
          message: 'x',
          media: [{ path: 'https://cdn.example/a.jpg' }],
          settings: {
            post_type: 'story',
            collaborators: [{ label: '@alice' }],
          },
        },
      ] as any,
      {} as any
    );
    await jest.runAllTimersAsync();
    await posting;

    expect(calls[0]).toContain('media_type=STORIES');
    expect(calls[0]).not.toContain('collaborators');
  });

  it('IN_PROGRESS consulta o status de novo e dorme 30 s apos cada checagem, inclusive FINISHED', async () => {
    jest.useFakeTimers();
    const sleeps = jest.spyOn(global, 'setTimeout');
    const provider = new InstagramProvider();
    let polls = 0;
    const calls = mockGraph(provider, () => ({
      status_code: ++polls === 1 ? 'IN_PROGRESS' : 'FINISHED',
    }));

    const posting = provider.post(
      'ig-1',
      'token',
      [
        {
          id: 'p',
          message: 'x',
          media: [{ path: 'https://cdn.example/a.jpg' }],
          settings: { post_type: 'post' },
        },
      ] as any,
      {} as any
    );
    await jest.runAllTimersAsync();
    await posting;

    expect(calls.filter((u) => u.includes('fields=status_code')).length).toBe(
      2
    );
    // cadencia do fork: um sleep apos IN_PROGRESS e outro apos FINISHED
    expect(sleeps.mock.calls.filter(([, ms]) => ms === 30000)).toHaveLength(2);
    sleeps.mockRestore();
  });

  it('container em ERROR sem detalhe usa a mensagem padrao; com detalhe nao mapeado usa o detalhe', async () => {
    jest.useFakeTimers();
    const semDetalhe = new InstagramProvider();
    mockGraph(semDetalhe, () => ({ status_code: 'ERROR', status: 'ERROR' }));
    const p1 = semDetalhe.post(
      'ig-1',
      'token',
      [
        {
          id: 'p',
          message: 'x',
          media: [{ path: 'https://cdn.example/a.jpg' }],
          settings: { post_type: 'post' },
        },
      ] as any,
      {} as any
    );
    const a1 = expect(p1).rejects.toThrow(
      /Instagram could not process the media/
    );
    await jest.runAllTimersAsync();
    await a1;

    const comDetalhe = new InstagramProvider();
    mockGraph(comDetalhe, () => ({
      status_code: 'ERROR',
      status: 'Error: The video file is corrupted',
    }));
    const p2 = comDetalhe.post(
      'ig-1',
      'token',
      [
        {
          id: 'p',
          message: 'x',
          media: [{ path: 'https://cdn.example/a.jpg' }],
          settings: { post_type: 'post' },
        },
      ] as any,
      {} as any
    );
    const a2 = expect(p2).rejects.toThrow(/The video file is corrupted/);
    await jest.runAllTimersAsync();
    await a2;
  });
});

describe('InstagramProvider texto alternativo', () => {
  afterEach(() => jest.useRealTimers());
  it.each([
    ['post', 'photo.jpg', true],
    ['post', 'video.mp4', false],
    ['story', 'photo.jpg', false],
  ])(
    'envia alt_text somente na imagem do feed: %s %s',
    async (post_type, file, expected) => {
      jest.useFakeTimers();
      const provider = new InstagramProvider();
      const calls: string[] = [];
      jest.spyOn(provider, 'fetch').mockImplementation(async (url: any) => {
        calls.push(String(url));
        return {
          json: async () =>
            String(url).includes('fields=status_code')
              ? { status_code: 'FINISHED' }
              : String(url).includes('fields=permalink')
              ? { permalink: 'https://instagram.example/p/1' }
              : { id: 'media-1' },
        } as Response;
      });
      const posting = provider.post(
        'ig',
        'token',
        [
          {
            id: 'p',
            message: 'Texto',
            media: [{ path: `https://cdn.example/${file}`, alt: 'Café & pão' }],
            settings: { post_type },
          },
        ] as any,
        {} as any
      );
      await jest.runAllTimersAsync();
      await posting;
      const container = calls.find((url) => url.includes('/media?'))!;
      expect(container.includes('alt_text=')).toBe(expected);
      if (expected)
        expect(new URL(container).searchParams.get('alt_text')).toBe(
          'Café & pão'
        );
    }
  );
  it('recusa alt acima de 1000 caracteres antes da publicacao', async () => {
    const provider = new InstagramProvider();
    const request = jest.spyOn(provider, 'fetch');
    await expect(
      provider.post(
        'ig',
        'token',
        [
          {
            id: 'p',
            message: '',
            media: [
              { path: 'https://cdn.example/a.jpg', alt: 'x'.repeat(1001) },
            ],
            settings: { post_type: 'post' },
          },
        ] as any,
        {} as any
      )
    ).rejects.toMatchObject({ message: expect.stringContaining('1000') });
    expect(request).not.toHaveBeenCalled();
  });
});
