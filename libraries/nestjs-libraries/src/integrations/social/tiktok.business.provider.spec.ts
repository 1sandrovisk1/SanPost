import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { TiktokBusinessProvider } from './tiktok.business.provider';
import {
  BadBody,
  PublishedWithError,
  RefreshToken,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';

jest.mock('@gitroom/helpers/utils/timer', () => ({
  timer: jest.fn(),
}));

jest.mock('@gitroom/nestjs-libraries/services/make.secure.id', () => {
  const actual = jest.requireActual(
    '@gitroom/nestjs-libraries/services/make.secure.id'
  );
  return { makeSecureId: jest.fn(actual.makeSecureId) };
});

// A API do TikTok for Business ainda nao foi aprovada para o mantenedor: todo
// o fluxo e coberto com fetch mockado (porte do upstream 4ace3a7a..97ee8b9f).
const BASE = 'https://business-api.tiktok.com/open_api/v1.3';
const BIG_ID = '7345678901234567891'; // acima de 2^53: JSON.parse arredonda

const jsonResponse = (body: unknown) =>
  ({
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as any);

const textResponse = (raw: string) =>
  ({
    json: async () => JSON.parse(raw),
    text: async () => raw,
  } as any);

const integration = (overrides: Record<string, unknown> = {}) =>
  ({
    internalId: 'open-id-1',
    profile: 'perfil.loja',
    ...overrides,
  } as any);

const settings = (overrides: Record<string, unknown> = {}) => ({
  content_posting_method: 'DIRECT_POST',
  privacy_level: 'PUBLIC_TO_EVERYONE',
  duet: false,
  stitch: false,
  comment: true,
  autoAddMusic: 'no',
  brand_content_toggle: false,
  brand_organic_toggle: false,
  video_made_with_ai: false,
  ...overrides,
});

const videoPost = (overrides: Record<string, unknown> = {}) => ({
  id: 'post-1',
  message: 'Legenda do video',
  media: [{ type: 'video', path: 'https://cdn.example/clip.mp4' }],
  settings: settings(overrides),
});

const photoPost = (
  overrides: Record<string, unknown> = {},
  media = [
    { type: 'image', path: 'https://cdn.example/a.jpg' },
    { type: 'image', path: 'https://cdn.example/b.jpg' },
  ]
) => ({
  id: 'post-2',
  message: 'Descricao da foto',
  media,
  settings: settings(overrides),
});

describe('TiktokBusinessProvider', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://app.exemplo.com';
    process.env.TIKTOK_BUSINESS_CLIENT_ID = 'env-client';
    process.env.TIKTOK_BUSINESS_CLIENT_SECRET = 'env-secret';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  describe('handleErrors', () => {
    const provider = new TiktokBusinessProvider();

    it.each([
      ['{"code":40000,"message":"The access token is invalid"}'],
      ['{"code":40105,"message":"auth_removed"}'],
      ['{"code":40104,"message":"Access token is incorrect"}'],
      ['{"code":40105,"message":"Access token has expired"}'],
      ['{"error":"access_token_invalid"}'],
    ])('%s pede renovacao do token', (body) => {
      expect(provider.handleErrors(body)).toEqual({
        type: 'refresh-token',
        value:
          'Access token invalid, please re-authenticate your TikTok account',
      });
    });

    it('cota diaria de usuarios continua post com erro (sem disconnect no fork)', () => {
      expect(provider.handleErrors('reached_active_user_cap')).toEqual({
        type: 'bad-body',
        value: 'TikTok daily user limit reached, please try again tomorrow',
      });
    });

    it('mensagens especificas vencem as genericas', () => {
      expect(provider.handleErrors('spam_risk_too_many_posts')?.value).toMatch(
        /daily post limit/
      );
      expect(provider.handleErrors('spam_risk_text')?.value).toMatch(
        /spam in the post text/
      );
      expect(provider.handleErrors('spam_risk')?.value).toBe(
        'TikTok detected potential spam'
      );
    });

    it.each([
      ['picture_size_check_failed', /images up to 1080px on the shorter side/],
      ['url_ownership_unverified', /verified URL property/],
      ['publish_cancelled', /cancelled the upload/],
      ['Too many requests', /rate limit/],
      ['video_pull_failed', /pull video/],
      ['invalid_params', /Invalid request parameters/],
    ])('%s vira bad-body curado', (body, message) => {
      const result = provider.handleErrors(body);
      expect(result?.type).toBe('bad-body');
      expect(result?.value).toMatch(message);
    });

    it('erro desconhecido nao e classificado', () => {
      expect(provider.handleErrors('{"code":1,"message":"x"}')).toBeUndefined();
    });
  });

  describe('generateAuthUrl', () => {
    it('gera o state com makeSecureId e usa o app do workspace', async () => {
      const provider = new TiktokBusinessProvider();
      const result = await provider.generateAuthUrl({
        client_id: 'app-do-perfil',
        client_secret: 'segredo',
        instanceUrl: '',
      });

      expect(makeSecureId).toHaveBeenCalledWith(32);
      expect(result.state).toHaveLength(32);
      expect(result.codeVerifier).toBe(result.state);

      const url = new URL(result.url);
      expect(url.origin + url.pathname).toBe(
        'https://www.tiktok.com/v2/auth/authorize/'
      );
      expect(url.searchParams.get('client_key')).toBe('app-do-perfil');
      expect(url.searchParams.get('state')).toBe(result.state);
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('disable_auto_auth')).toBe('1');
      // portal Business exige a barra final no redirect cadastrado
      expect(url.searchParams.get('redirect_uri')).toBe(
        'https://app.exemplo.com/integrations/social/tiktok-business/'
      );
      expect(url.searchParams.get('scope')).toBe(
        'user.info.basic,user.info.username,user.info.stats,video.list,video.upload,video.publish'
      );
    });

    it('credencial do perfil vai sempre em par, sem misturar com o segredo do env', async () => {
      const provider = new TiktokBusinessProvider();
      const globalFetch = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(jsonResponse({ code: 40002, message: 'x' }));

      await provider
        .refreshToken('rft', {
          client_id: 'app-do-perfil',
          client_secret: '',
          instanceUrl: '',
        })
        .catch(() => undefined);

      const sent = JSON.parse(
        (globalFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(sent.client_id).toBe('app-do-perfil');
      expect(sent.client_secret).toBe('');
    });

    it('sem credencial salva cai no app do env', async () => {
      const provider = new TiktokBusinessProvider();
      const result = await provider.generateAuthUrl();
      expect(new URL(result.url).searchParams.get('client_key')).toBe(
        'env-client'
      );
    });

    it('states diferentes a cada chamada', async () => {
      const provider = new TiktokBusinessProvider();
      const a = await provider.generateAuthUrl();
      const b = await provider.generateAuthUrl();
      expect(a.state).not.toBe(b.state);
    });
  });

  describe('authenticate', () => {
    it('redirect sem auth_code falha com BadBody antes de chamar o TikTok', async () => {
      const provider = new TiktokBusinessProvider();
      const globalFetch = jest.spyOn(global, 'fetch');
      const providerFetch = jest.spyOn(provider, 'fetch');

      const error = await provider
        .authenticate({ code: '', codeVerifier: 'state' })
        .catch((e) => e);

      expect(error).toBeInstanceOf(BadBody);
      expect(error.message).toBe(
        'TikTok did not return an authorization code, the authorization was not completed'
      );
      expect(globalFetch).not.toHaveBeenCalled();
      expect(providerFetch).not.toHaveBeenCalled();
    });

    it('troca o auth_code com o app do perfil e carrega a conta', async () => {
      const provider = new TiktokBusinessProvider();
      const globalFetch = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          code: 0,
          data: {
            access_token: 'act',
            refresh_token: 'rft',
            open_id: '-000abc-def',
            scope:
              'user.info.basic,user.info.username,user.info.stats,video.list,video.upload,video.publish',
          },
        })
      );
      const providerFetch = jest.spyOn(provider, 'fetch').mockResolvedValue(
        jsonResponse({
          code: 0,
          data: {
            display_name: 'Loja',
            profile_image: 'https://p16.tiktokcdn.com/a.jpg',
            username: 'perfil.loja',
          },
        })
      );

      const result = await provider.authenticate(
        { code: 'AUTH', codeVerifier: 'state' },
        { client_id: 'app-do-perfil', client_secret: 'segredo', instanceUrl: '' }
      );

      expect(globalFetch).toHaveBeenCalledWith(
        `${BASE}/tt_user/oauth2/token/`,
        expect.objectContaining({ method: 'POST' })
      );
      const sent = JSON.parse(
        (globalFetch.mock.calls[0][1] as RequestInit).body as string
      );
      expect(sent).toEqual({
        client_id: 'app-do-perfil',
        client_secret: 'segredo',
        grant_type: 'authorization_code',
        auth_code: 'AUTH',
        redirect_uri:
          'https://app.exemplo.com/integrations/social/tiktok-business/',
      });
      expect(providerFetch.mock.calls[0][0]).toContain(
        `${BASE}/business/get/?business_id=-000abc-def`
      );
      expect(
        (providerFetch.mock.calls[0][1] as any).headers['Access-Token']
      ).toBe('act');
      // open_id e o business_id: guardado sem normalizar
      expect(result).toMatchObject({
        id: '-000abc-def',
        name: 'Loja',
        accessToken: 'act',
        refreshToken: 'rft',
        username: 'perfil.loja',
        picture: 'https://p16.tiktokcdn.com/a.jpg',
      });
    });

    it('code diferente de zero vira BadBody com o motivo do TikTok', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          jsonResponse({ code: 40002, message: 'redirect_uri mismatch' })
        );

      await expect(
        provider.authenticate({ code: 'AUTH', codeVerifier: 'x' })
      ).rejects.toMatchObject({ message: 'redirect_uri mismatch' });
    });

    it('conta que nao carrega nao cria canal quebrado', async () => {
      const provider = new TiktokBusinessProvider();
      jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          code: 0,
          data: {
            access_token: 'act',
            refresh_token: 'rft',
            open_id: 'oid',
            scope:
              'user.info.basic,user.info.username,user.info.stats,video.list,video.upload,video.publish',
          },
        })
      );
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(jsonResponse({ code: 40001, message: 'no access' }));

      await expect(
        provider.authenticate({ code: 'AUTH', codeVerifier: 'x' })
      ).rejects.toBeInstanceOf(BadBody);
    });
  });

  describe('refreshToken', () => {
    it('renova com o app do perfil', async () => {
      const provider = new TiktokBusinessProvider();
      const globalFetch = jest.spyOn(global, 'fetch').mockResolvedValue(
        jsonResponse({
          code: 0,
          data: { access_token: 'novo', refresh_token: 'rft2', open_id: 'oid' },
        })
      );
      jest.spyOn(provider, 'fetch').mockResolvedValue(
        jsonResponse({
          code: 0,
          data: { display_name: 'Loja', username: 'perfil.loja' },
        })
      );

      const result = await provider.refreshToken('rft', {
        client_id: 'app-do-perfil',
        client_secret: 'segredo',
        instanceUrl: '',
      });

      expect(globalFetch.mock.calls[0][0]).toBe(
        `${BASE}/tt_user/oauth2/refresh_token/`
      );
      expect(
        JSON.parse((globalFetch.mock.calls[0][1] as RequestInit).body as string)
      ).toEqual({
        client_id: 'app-do-perfil',
        client_secret: 'segredo',
        grant_type: 'refresh_token',
        refresh_token: 'rft',
      });
      expect(result).toMatchObject({
        accessToken: 'novo',
        refreshToken: 'rft2',
        id: 'oid',
        picture: '',
      });
    });

    it('refresh recusado vira BadBody sem TypeError', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          jsonResponse({ code: 40105, message: 'Access token has expired' })
        );

      const error = await provider.refreshToken('rft').catch((e) => e);
      expect(error).toBeInstanceOf(BadBody);
      expect(error.message).toMatch(/re-authenticate/);
    });
  });

  describe('postPending - checagens antes do publish', () => {
    it.each([
      [[], 'No video / images selected'],
      [
        [
          { type: 'video', path: 'https://cdn.example/a.mp4' },
          { type: 'image', path: 'https://cdn.example/b.jpg' },
        ],
        'Only pictures are supported when selecting multiple items',
      ],
      [
        Array.from({ length: 36 }, (_, i) => ({
          type: 'image',
          path: `https://cdn.example/${i}.jpg`,
        })),
        'You can select up to 35 pictures',
      ],
    ])('midia invalida falha antes do publish (%#)', async (media, message) => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest.spyOn(provider, 'fetch');
      const dimensions = jest.spyOn(provider as any, 'getImageDimensions');

      const error = await provider
        .postPending('oid', 'act', [photoPost({}, media as any)] as any, integration())
        .catch((e) => e);

      expect(error).toBeInstanceOf(BadBody);
      expect(error.message).toBe(message);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(dimensions).not.toHaveBeenCalled();
    });

    it('legenda de video acima de 2.200 falha antes de chamar o TikTok', async () => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest.spyOn(provider, 'fetch');
      const post = { ...videoPost(), message: 'a'.repeat(2201) };

      const error = await provider
        .postPending('oid', 'act', [post] as any, integration())
        .catch((e) => e);

      expect(error).toBeInstanceOf(BadBody);
      expect(error.message).toMatch(/2[.]?201/);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('imagem acima de 1080px no lado menor falha antes do publish e diz qual', async () => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest.spyOn(provider, 'fetch');
      const dimensions = jest
        .spyOn(provider as any, 'getImageDimensions')
        .mockResolvedValueOnce({ width: 1080, height: 1920 })
        .mockResolvedValueOnce({ width: 1440, height: 1920 });

      const error = await provider
        .postPending('oid', 'act', [photoPost()] as any, integration())
        .catch((e) => e);

      expect(error).toBeInstanceOf(BadBody);
      expect(error.message).toBe(
        'Image 2 is 1440x1920, TikTok allows a maximum of 1080px on the shorter side'
      );
      expect(dimensions).toHaveBeenCalledWith(
        'https://cdn.example/b.jpg',
        expect.any(Number)
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('imagem que nao da para medir nao bloqueia o post', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider as any, 'getImageDimensions')
        .mockRejectedValue(new Error('timeout'));
      const fetchSpy = jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(
          jsonResponse({ code: 0, data: { share_id: 'p_pub_url~1' } })
        );

      await expect(
        provider.postPending('oid', 'act', [photoPost()] as any, integration())
      ).resolves.toEqual([
        expect.objectContaining({
          status: 'pending',
          pendingData: { publishId: 'p_pub_url~1' },
        }),
      ]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('mede imagem local de verdade (sharp) dentro de UPLOAD_DIRECTORY', async () => {
      const directory = mkdtempSync(join(tmpdir(), 'tiktok-business-'));
      process.env.UPLOAD_DIRECTORY = directory;
      try {
        const small = join(directory, 'ok.jpg');
        const big = join(directory, 'grande.jpg');
        const image = (width: number, height: number) =>
          sharp({
            create: {
              width,
              height,
              channels: 3,
              background: { r: 10, g: 20, b: 30 },
            },
          })
            .jpeg()
            .toBuffer();
        writeFileSync(small, await image(1080, 1920));
        writeFileSync(big, await image(1200, 1600));

        const provider = new TiktokBusinessProvider();
        const fetchSpy = jest.spyOn(provider, 'fetch');
        await expect(
          (provider as any).getImageDimensions(big)
        ).resolves.toEqual({ width: 1200, height: 1600 });

        const error = await provider
          .postPending(
            'oid',
            'act',
            [
              photoPost({}, [
                { type: 'image', path: small },
                { type: 'image', path: big },
              ]),
            ] as any,
            integration()
          )
          .catch((e) => e);
        expect(error).toBeInstanceOf(BadBody);
        expect(error.message).toMatch(/^Image 2 is 1200x1600/);
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });

    it('URL baixada pelo axios SSRF-safe com limite de tamanho e prazo', async () => {
      const provider = new TiktokBusinessProvider();
      const jpeg = await sharp({
        create: { width: 1200, height: 1500, channels: 3, background: '#000' },
      })
        .jpeg()
        .toBuffer();
      const axios = jest.fn().mockResolvedValue({ data: jpeg });
      jest.spyOn(provider as any, 'getSsrfSafeAxios').mockReturnValue(axios);

      await expect(
        (provider as any).getImageDimensions('https://cdn.example/a.jpg', 5000)
      ).resolves.toEqual({ width: 1200, height: 1500 });
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://cdn.example/a.jpg',
          responseType: 'arraybuffer',
          maxContentLength: 25 * 1024 * 1024,
          maxBodyLength: 25 * 1024 * 1024,
          signal: expect.any(AbortSignal),
        })
      );
    });

    it('orcamento de tempo esgotado para de medir e deixa o TikTok decidir', async () => {
      const provider = new TiktokBusinessProvider();
      let now = 1_000;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      const dimensions = jest
        .spyOn(provider as any, 'getImageDimensions')
        .mockImplementation(async () => {
          now += 61_000;
          return { width: 1080, height: 1080 };
        });
      const fetchSpy = jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(
          jsonResponse({ code: 0, data: { share_id: 'p_pub_url~1' } })
        );

      await provider.postPending('oid', 'act', [photoPost()] as any, integration());

      expect(dimensions).toHaveBeenCalledTimes(1);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('video nao passa pela checagem de imagem', async () => {
      const provider = new TiktokBusinessProvider();
      const dimensions = jest.spyOn(provider as any, 'getImageDimensions');
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(
          jsonResponse({ code: 0, data: { share_id: 'v_pub_url~1' } })
        );

      await provider.postPending('oid', 'act', [videoPost()] as any, integration());
      expect(dimensions).not.toHaveBeenCalled();
    });
  });

  describe('postPending - payload', () => {
    const publishOk = (shareId: string) =>
      jsonResponse({ code: 0, data: { share_id: shareId } });

    it('video DIRECT_POST com musica, localizacao e flags legadas em string', async () => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(publishOk('v_pub_url~9'));

      const result = await provider.postPending(
        'oid',
        'act',
        [
          {
            ...videoPost({
              comment: 'false',
              duet: 'true',
              stitch: 'false',
              video_made_with_ai: 'true',
              brand_organic_toggle: 'true',
              music: { id: 'clip-1', audio_volume: '30' },
              location: { id: 'loc-1', name: 'Sao Paulo' },
            }),
            media: [
              {
                type: 'video',
                path: 'https://cdn.example/clip.mp4',
                thumbnailTimestamp: 1500,
              },
            ],
          },
        ] as any,
        integration()
      );

      const [url, options] = fetchSpy.mock.calls[0] as [string, any];
      expect(url).toBe(`${BASE}/business/video/publish/`);
      expect(options.method).toBe('POST');
      expect(options.headers['Access-Token']).toBe('act');
      expect(JSON.parse(options.body)).toEqual({
        business_id: 'oid',
        video_url: 'https://cdn.example/clip.mp4',
        thumbnail_offset: 1500,
        post_info: {
          caption: 'Legenda do video',
          is_brand_organic: true,
          is_branded_content: false,
          disable_comment: true,
          disable_duet: false,
          disable_stitch: true,
          is_ai_generated: true,
          location_id: 'loc-1',
          location_name: 'Sao Paulo',
          music_sound_info: {
            music_sound_id: 'clip-1',
            music_sound_volume: 30,
            // sem volume explicito segue o app (50), nao sai mudo
            video_original_sound_volume: 50,
          },
        },
      });
      expect(result).toEqual([
        {
          id: 'post-1',
          releaseURL: '',
          postId: '',
          status: 'pending',
          pendingData: { publishId: 'v_pub_url~9' },
        },
      ]);
    });

    it('video com capa enviada usa custom_thumbnail_url', async () => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(publishOk('v_pub_url~9'));

      await provider.postPending(
        'oid',
        'act',
        [
          {
            ...videoPost(),
            media: [
              {
                type: 'video',
                path: 'https://cdn.example/clip.mp4',
                thumbnail: 'https://cdn.example/capa.jpg',
                thumbnailTimestamp: 1500,
              },
            ],
          },
        ] as any,
        integration()
      );

      const body = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
      expect(body.custom_thumbnail_url).toBe('https://cdn.example/capa.jpg');
      expect(body).not.toHaveProperty('thumbnail_offset');
    });

    it('UPLOAD de video so manda legenda e upload_to_draft', async () => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(publishOk('v_inbox_url~1'));

      await provider.postPending(
        'oid',
        'act',
        [
          videoPost({
            content_posting_method: 'UPLOAD',
            music: { id: 'clip-1' },
            location: { id: 'loc-1', name: 'x' },
          }),
        ] as any,
        integration()
      );

      const { post_info } = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
      expect(post_info).toEqual({
        caption: 'Legenda do video',
        is_brand_organic: false,
        is_branded_content: false,
        upload_to_draft: true,
      });
    });

    it('foto DIRECT_POST com titulo cortado em 90, privacidade padrao e faixa escolhida', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider as any, 'getImageDimensions')
        .mockResolvedValue({ width: 1080, height: 1350 });
      const fetchSpy = jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(publishOk('p_pub_url~2'));

      await provider.postPending(
        'oid',
        'act',
        [
          photoPost({
            title: 't'.repeat(120),
            privacy_level: undefined,
            music: { id: 'clip-7', audio_volume: 80 },
          }),
        ] as any,
        integration()
      );

      const [url, options] = fetchSpy.mock.calls[0] as [string, any];
      expect(url).toBe(`${BASE}/business/photo/publish/`);
      expect(JSON.parse(options.body)).toEqual({
        business_id: 'oid',
        photo_images: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg'],
        photo_cover_index: 0,
        post_info: {
          title: 't'.repeat(90),
          caption: 'Descricao da foto',
          is_brand_organic: false,
          is_branded_content: false,
          privacy_level: 'PUBLIC_TO_EVERYONE',
          disable_comment: false,
          auto_add_music: false,
          // foto: music_sound_info sem volumes
          music_sound_info: { music_sound_id: 'clip-7' },
        },
      });
    });

    it('musica aleatoria em foto sorteia da lista de tendencias e ignora a faixa escolhida', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider as any, 'getImageDimensions')
        .mockResolvedValue({ width: 1080, height: 1080 });
      jest.spyOn(Math, 'random').mockReturnValue(0.99);
      const musicSearch = jest
        .spyOn(provider, 'musicSearch')
        .mockResolvedValue([
          { id: 'clip-a' },
          { id: 'clip-b' },
        ] as any);
      const fetchSpy = jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(publishOk('p_pub_url~3'));

      await provider.postPending(
        'oid',
        'act',
        [photoPost({ autoAddMusic: 'yes', music: { id: 'clip-escolhido' } })] as any,
        integration()
      );

      expect(musicSearch).toHaveBeenCalledWith('act', {}, 'oid');
      const { post_info } = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
      expect(post_info.music_sound_info).toEqual({ music_sound_id: 'clip-b' });
      expect(post_info.auto_add_music).toBe(false);
    });

    it('volume null usa o padrao 50 em vez de mudo', async () => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(publishOk('v_pub_url~9'));

      await provider.postPending(
        'oid',
        'act',
        [videoPost({ music: { id: 'clip-1', audio_volume: null, video_volume: 0 } })] as any,
        integration()
      );

      const { post_info } = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
      expect(post_info.music_sound_info).toEqual({
        music_sound_id: 'clip-1',
        music_sound_volume: 50,
        video_original_sound_volume: 0,
      });
    });

    it('lista de musicas fora do ar cai no auto_add_music; erro de token sobe antes do publish', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider as any, 'getImageDimensions')
        .mockResolvedValue({ width: 1080, height: 1080 });
      jest
        .spyOn(provider, 'musicSearch')
        .mockRejectedValueOnce(new Error('HTML 502'))
        .mockRejectedValueOnce(
          new RefreshToken('tiktok-business', '{}', '{}', 'expired')
        );
      const fetchSpy = jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(publishOk('p_pub_url~3'));

      await provider.postPending(
        'oid',
        'act',
        [photoPost({ autoAddMusic: 'yes' })] as any,
        integration()
      );
      const { post_info } = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
      expect(post_info.auto_add_music).toBe(true);

      await expect(
        provider.postPending(
          'oid',
          'act',
          [photoPost({ autoAddMusic: 'yes' })] as any,
          integration()
        )
      ).rejects.toBeInstanceOf(RefreshToken);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('musica aleatoria sem lista cai no auto_add_music do TikTok', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider as any, 'getImageDimensions')
        .mockResolvedValue({ width: 1080, height: 1080 });
      jest.spyOn(provider, 'musicSearch').mockResolvedValue([]);
      const fetchSpy = jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(publishOk('p_pub_url~3'));

      await provider.postPending(
        'oid',
        'act',
        [photoPost({ autoAddMusic: 'yes' })] as any,
        integration()
      );

      const { post_info } = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
      expect(post_info.auto_add_music).toBe(true);
      expect(post_info).not.toHaveProperty('music_sound_info');
    });

    it('foto UPLOAD vira rascunho sem privacidade, musica nem localizacao', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider as any, 'getImageDimensions')
        .mockResolvedValue({ width: 1080, height: 1080 });
      const musicSearch = jest.spyOn(provider, 'musicSearch');
      const fetchSpy = jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(publishOk('p_inbox_url~3'));

      await provider.postPending(
        'oid',
        'act',
        [
          photoPost({
            content_posting_method: 'UPLOAD',
            autoAddMusic: 'yes',
            location: { id: 'loc-1', name: 'x' },
          }),
        ] as any,
        integration()
      );

      expect(musicSearch).not.toHaveBeenCalled();
      const { post_info } = JSON.parse((fetchSpy.mock.calls[0][1] as any).body);
      expect(post_info).toEqual({
        caption: 'Descricao da foto',
        is_brand_organic: false,
        is_branded_content: false,
        is_draft: true,
      });
    });

    it('"The access token is invalid" no publish vira RefreshToken', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(
          jsonResponse({ code: 40000, message: 'The access token is invalid' })
        );

      await expect(
        provider.postPending('oid', 'act', [videoPost()] as any, integration())
      ).rejects.toBeInstanceOf(RefreshToken);
    });

    it('recusa do TikTok vira BadBody com a mensagem curada', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(
          jsonResponse({ code: 40002, message: 'url_ownership_unverified' })
        );

      const error = await provider
        .postPending('oid', 'act', [videoPost()] as any, integration())
        .catch((e) => e);
      expect(error).toBeInstanceOf(BadBody);
      expect(error.message).toMatch(/verified URL property/);
    });
  });

  describe('checkPostStatus', () => {
    const status = (data: string) =>
      textResponse(`{"code":0,"message":"OK","data":${data}}`);

    it('consulta o status com business_id e publish_id', async () => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(status('{"status":"PROCESSING_UPLOAD"}'));

      await expect(
        provider.checkPostStatus(
          'act',
          { publishId: 'v_pub_url~1' },
          integration()
        )
      ).resolves.toEqual({
        status: 'pending',
        pendingData: { publishId: 'v_pub_url~1' },
      });
      expect(fetchSpy.mock.calls[0][0]).toBe(
        `${BASE}/business/publish/status/?business_id=open-id-1&publish_id=v_pub_url~1`
      );
    });

    it('PUBLISH_COMPLETE preserva o id int64 e monta a URL do video', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(
          status(`{"status":"PUBLISH_COMPLETE","post_ids":[${BIG_ID}]}`)
        );

      await expect(
        provider.checkPostStatus('act', { publishId: 'v_pub_url~1' }, integration())
      ).resolves.toEqual({
        status: 'completed',
        postId: BIG_ID,
        releaseURL: `https://www.tiktok.com/@perfil.loja/video/${BIG_ID}`,
      });
    });

    it('post de foto abre em /photo/', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(
          status(`{"status":"PUBLISH_COMPLETE","post_ids":["${BIG_ID}"]}`)
        );

      await expect(
        provider.checkPostStatus('act', { publishId: 'p_pub_url~1' }, integration())
      ).resolves.toMatchObject({
        releaseURL: `https://www.tiktok.com/@perfil.loja/photo/${BIG_ID}`,
      });
    });

    it('sem post_ids fica o share_id e a URL do perfil', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(status('{"status":"PUBLISH_COMPLETE","post_ids":[]}'));

      await expect(
        provider.checkPostStatus('act', { publishId: 'v_pub_url~1' }, integration())
      ).resolves.toEqual({
        status: 'completed',
        postId: 'v_pub_url~1',
        releaseURL: 'https://www.tiktok.com/@perfil.loja',
      });
    });

    it('canal sem perfil guarda o share_id e nunca monta /@/', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(
          status(`{"status":"PUBLISH_COMPLETE","post_ids":[${BIG_ID}]}`)
        );

      await expect(
        provider.checkPostStatus(
          'act',
          { publishId: 'v_pub_url~1' },
          integration({ profile: null })
        )
      ).resolves.toEqual({
        status: 'completed',
        postId: 'v_pub_url~1',
        releaseURL: 'https://www.tiktok.com/',
      });
    });

    it('FAILED com motivo desconhecido mostra o motivo, nunca mensagem vazia', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(status('{"status":"FAILED","reason":"novo_motivo_x"}'));

      const error = await provider
        .checkPostStatus('act', { publishId: 'v_pub_url~1' }, integration())
        .catch((e) => e);
      expect(error).toBeInstanceOf(BadBody);
      expect(error.message).toBe(
        'TikTok could not publish the post: novo_motivo_x'
      );
    });

    it('rascunho na caixa de entrada fica missing com o share id no fragmento', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(status('{"status":"SEND_TO_USER_INBOX"}'));

      await expect(
        provider.checkPostStatus('act', { publishId: 'v_inbox_url~1' }, integration())
      ).resolves.toEqual({
        status: 'completed',
        postId: 'missing',
        releaseURL: 'https://www.tiktok.com/messages?lang=en#v_inbox_url~1',
      });
    });

    it('FAILED vira BadBody com o motivo classificado', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(
          status('{"status":"FAILED","reason":"picture_size_check_failed"}')
        );

      const error = await provider
        .checkPostStatus('act', { publishId: 'p_pub_url~1' }, integration())
        .catch((e) => e);
      expect(error).toBeInstanceOf(BadBody);
      expect(error.message).toMatch(/1080px/);
    });

    it('erro de token no envelope vira RefreshToken; outro erro continua pendente', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValueOnce(
          textResponse('{"code":40000,"message":"The access token is invalid"}')
        )
        .mockResolvedValueOnce(textResponse('{"code":50000,"message":"busy"}'));

      await expect(
        provider.checkPostStatus('act', { publishId: 'v_pub_url~1' }, integration())
      ).rejects.toBeInstanceOf(RefreshToken);
      await expect(
        provider.checkPostStatus('act', { publishId: 'v_pub_url~1' }, integration())
      ).resolves.toMatchObject({ status: 'pending' });
    });

    it('falha de rede ou corpo que nao e JSON continua pendente', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider, 'fetch')
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValueOnce(textResponse('<html>502</html>'));

      for (let i = 0; i < 2; i += 1) {
        await expect(
          provider.checkPostStatus('act', { publishId: 'v_pub_url~1' }, integration())
        ).resolves.toMatchObject({ status: 'pending' });
      }
    });
  });

  describe('post (workflow V102)', () => {
    it('publica uma vez e consulta o status ate concluir', async () => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest
        .spyOn(provider, 'fetch')
        .mockResolvedValueOnce(
          jsonResponse({ code: 0, data: { share_id: 'v_pub_url~5' } })
        )
        .mockResolvedValueOnce(
          textResponse('{"code":0,"data":{"status":"PROCESSING_DOWNLOAD"}}')
        )
        .mockResolvedValueOnce(
          textResponse(
            `{"code":0,"data":{"status":"PUBLISH_COMPLETE","post_ids":[${BIG_ID}]}}`
          )
        );

      await expect(
        provider.post('oid', 'act', [videoPost()] as any, integration())
      ).resolves.toEqual([
        {
          id: 'post-1',
          postId: BIG_ID,
          releaseURL: `https://www.tiktok.com/@perfil.loja/video/${BIG_ID}`,
          status: 'success',
        },
      ]);
      const publishCalls = fetchSpy.mock.calls.filter(([url]) =>
        String(url).includes('/publish/') && !String(url).includes('status')
      );
      expect(publishCalls).toHaveLength(1);
    });
  });

  describe('post (workflow V102) - depois do publish nada e retentavel', () => {
    it('token expirado na consulta guarda o share_id e nao publica de novo', async () => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest
        .spyOn(provider, 'fetch')
        .mockResolvedValueOnce(
          jsonResponse({ code: 0, data: { share_id: 'v_pub_url~7' } })
        )
        .mockResolvedValueOnce(
          textResponse('{"code":40105,"message":"Access token has expired"}')
        );

      const error = await provider
        .post('oid', 'act', [videoPost()] as any, integration())
        .catch((e) => e);

      expect(error).toBeInstanceOf(PublishedWithError);
      expect(error).toMatchObject({
        postDbId: 'post-1',
        releaseId: 'v_pub_url~7',
        releaseURL: 'https://www.tiktok.com/@perfil.loja',
      });
      expect(error.message).toMatch(/accepted the post/);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });

    it('sem confirmacao em 8 minutos encerra sem erro retentavel', async () => {
      const provider = new TiktokBusinessProvider();
      let now = 0;
      jest.spyOn(Date, 'now').mockImplementation(() => now);
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValueOnce(
          jsonResponse({ code: 0, data: { share_id: 'v_pub_url~8' } })
        )
        .mockImplementation(async () => {
          now += 5 * 60 * 1000;
          return textResponse(
            '{"code":0,"data":{"status":"PROCESSING_DOWNLOAD"}}'
          );
        });

      const error = await provider
        .post('oid', 'act', [videoPost()] as any, integration())
        .catch((e) => e);

      expect(error).toBeInstanceOf(PublishedWithError);
      expect(error).toMatchObject({ releaseId: 'v_pub_url~8' });
      expect(error.message).toMatch(/did not confirm the publication in time/);
    });

    it('FAILED durante a consulta continua sendo BadBody (nada foi publicado)', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValueOnce(
          jsonResponse({ code: 0, data: { share_id: 'v_pub_url~9' } })
        )
        .mockResolvedValueOnce(
          textResponse(
            '{"code":0,"data":{"status":"FAILED","reason":"duration_check_failed"}}'
          )
        );

      const error = await provider
        .post('oid', 'act', [videoPost()] as any, integration())
        .catch((e) => e);
      expect(error).toBeInstanceOf(BadBody);
      expect(error.message).toMatch(/duration is invalid/);
    });
  });

  describe('resolveReleaseId / releaseUrl', () => {
    it('resolve o share_id pelo analyticsFetch, sem o fetch de publicacao', async () => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest.spyOn(provider, 'fetch');
      jest
        .spyOn(provider as any, 'analyticsFetch')
        .mockResolvedValue(
          textResponse(
            `{"code":0,"data":{"status":"PUBLISH_COMPLETE","post_ids":[${BIG_ID}]}}`
          )
        );

      await expect(
        provider.resolveReleaseId('act', 'v_pub_url~1', integration())
      ).resolves.toEqual({
        postId: BIG_ID,
        releaseURL: `https://www.tiktok.com/@perfil.loja/video/${BIG_ID}`,
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('foto privada nunca tera link publico', async () => {
      const provider = new TiktokBusinessProvider();
      const analytics = jest.spyOn(provider as any, 'analyticsFetch');
      await expect(
        provider.resolveReleaseId('act', 'p_pub_url~1', integration(), {
          privacy_level: 'SELF_ONLY',
        })
      ).resolves.toEqual({ unavailable: true });
      expect(analytics).not.toHaveBeenCalled();
    });

    it('id que nao e share_id nao e consultado', async () => {
      const provider = new TiktokBusinessProvider();
      await expect(
        provider.resolveReleaseId('act', BIG_ID, integration())
      ).resolves.toBeUndefined();
    });

    it('rascunho ainda nao publicado continua abrindo a caixa de entrada', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider as any, 'analyticsFetch')
        .mockResolvedValue(
          textResponse('{"code":0,"data":{"status":"SEND_TO_USER_INBOX"}}')
        );

      await expect(
        provider.resolveReleaseId(
          'act',
          'missing',
          integration(),
          {},
          'https://www.tiktok.com/messages?lang=en#v_inbox_url~1'
        )
      ).resolves.toBeUndefined();
    });

    it('sem perfil ou sem id publico fica pendente', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider as any, 'analyticsFetch')
        .mockResolvedValueOnce(
          textResponse(
            `{"code":0,"data":{"status":"PUBLISH_COMPLETE","post_ids":[${BIG_ID}]}}`
          )
        )
        .mockResolvedValueOnce(textResponse('<html>erro</html>'));

      await expect(
        provider.resolveReleaseId('act', 'v_pub_url~1', integration({ profile: null }))
      ).resolves.toEqual({ pending: true });
      await expect(
        provider.resolveReleaseId('act', 'v_pub_url~1', integration())
      ).resolves.toEqual({ pending: true });
    });

    it('erro de token na resolucao vira RefreshToken', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider as any, 'analyticsFetch')
        .mockResolvedValue(
          textResponse('{"code":40105,"message":"Access token has expired"}')
        );

      await expect(
        provider.resolveReleaseId('act', 'v_pub_url~1', integration())
      ).rejects.toBeInstanceOf(RefreshToken);
    });

    it('releaseUrl de post conectado a mao so aceita id numerico', async () => {
      const provider = new TiktokBusinessProvider();
      await expect(
        provider.releaseUrl('act', BIG_ID, integration())
      ).resolves.toBe(`https://www.tiktok.com/@perfil.loja/video/${BIG_ID}`);
      await expect(
        provider.releaseUrl('act', '1/../../x', integration())
      ).resolves.toBeUndefined();
      await expect(
        provider.releaseUrl('act', BIG_ID, integration({ profile: null }))
      ).resolves.toBeUndefined();
    });
  });

  describe('musicSearch / locationSearch', () => {
    it('so devolve faixas com song_clip_id publicavel', async () => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest.spyOn(provider, 'fetch').mockResolvedValue(
        jsonResponse({
          code: 0,
          data: {
            list: [
              {
                commercial_music_name: 'Faixa cheia',
                artist: 'A',
                duration: 30,
                full_duration_song_clip: { song_clip_id: 'full-1' },
                trending_song_clip: { song_clip_id: 'trend-1' },
              },
              {
                commercial_music_name: 'So tendencia',
                trending_song_clip: {
                  song_clip_id: 'trend-2',
                  duration: 15,
                  preview_url: 'https://cdn/p.mp3',
                },
              },
              { commercial_music_name: 'Sem clip' },
            ],
          },
        })
      );

      const tracks = await provider.musicSearch('act', { genre: 'POP' }, 'oid');

      expect(fetchSpy.mock.calls[0][0]).toBe(
        `${BASE}/discovery/cml/trending_list/?business_id=oid&genre=POP`
      );
      expect(tracks).toEqual([
        expect.objectContaining({ id: 'full-1', title: 'Faixa cheia', duration: 30000 }),
        expect.objectContaining({
          id: 'trend-2',
          duration: 15000,
          previewUrl: 'https://cdn/p.mp3',
        }),
      ]);
    });

    it('erro de token na busca de musica vira RefreshToken; outro erro, lista vazia', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValueOnce(jsonResponse({ code: 40105, message: 'auth_removed' }))
        .mockResolvedValueOnce(jsonResponse({ code: 50000, message: 'busy' }));

      await expect(provider.musicSearch('act', {}, 'oid')).rejects.toBeInstanceOf(
        RefreshToken
      );
      await expect(provider.musicSearch('act', {}, 'oid')).resolves.toEqual([]);
    });

    it('busca de localizacao sem texto nao chama a API', async () => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest.spyOn(provider, 'fetch');
      await expect(provider.locationSearch('act', { q: '' }, 'oid')).resolves.toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('localizacoes mapeadas com id, nome e endereco', async () => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest.spyOn(provider, 'fetch').mockResolvedValue(
        jsonResponse({
          code: 0,
          data: {
            locations: [
              {
                location_id: 'loc-1',
                location_name: 'Avenida Paulista',
                location_address: 'Sao Paulo',
              },
            ],
          },
        })
      );

      await expect(
        provider.locationSearch('act', { q: 'paulista & cia' }, 'oid')
      ).resolves.toEqual([
        { id: 'loc-1', name: 'Avenida Paulista', address: 'Sao Paulo' },
      ]);
      expect(fetchSpy.mock.calls[0][0]).toContain(
        'search_query=paulista%20%26%20cia'
      );
    });
  });

  describe('analytics', () => {
    it('le pelo analyticsFetch e soma os videos recentes', async () => {
      const provider = new TiktokBusinessProvider();
      const fetchSpy = jest.spyOn(provider, 'fetch');
      jest
        .spyOn(provider as any, 'analyticsFetch')
        .mockResolvedValueOnce(
          jsonResponse({
            code: 0,
            data: {
              followers_count: 10,
              following_count: 2,
              total_likes: 30,
              videos_count: 4,
            },
          })
        )
        .mockResolvedValueOnce(
          jsonResponse({
            code: 0,
            data: {
              videos: [
                { video_views: 100, likes: 5, comments: 1, shares: 2 },
                { video_views: 50, likes: 1 },
              ],
            },
          })
        );

      const result = await provider.analytics('oid', 'act', 7);
      const totals = Object.fromEntries(
        result.map((r) => [r.label, r.data[0].total])
      );
      expect(totals).toMatchObject({
        Followers: '10',
        Views: '150',
        'Recent Likes': '6',
        'Recent Shares': '2',
      });
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('erro de token sobe para o chamador renovar', async () => {
      const provider = new TiktokBusinessProvider();
      jest
        .spyOn(provider as any, 'analyticsFetch')
        .mockResolvedValue(
          jsonResponse({ code: 40105, message: 'Access token has expired' })
        );

      await expect(provider.analytics('oid', 'act', 7)).rejects.toBeInstanceOf(
        RefreshToken
      );
    });

    it('metricas do post pelo item_id', async () => {
      const provider = new TiktokBusinessProvider();
      const analytics = jest
        .spyOn(provider as any, 'analyticsFetch')
        .mockResolvedValue(
          jsonResponse({
            code: 0,
            data: {
              videos: [
                { item_id: BIG_ID, video_views: 9, likes: 3, comments: 0, shares: 1 },
              ],
            },
          })
        );

      const result = await provider.postAnalytics('oid', 'act', BIG_ID, 0);

      expect(
        Object.fromEntries(result.map((r) => [r.label, r.data[0].total]))
      ).toEqual({ Views: '9', Likes: '3', Comments: '0', Shares: '1' });
      expect(String(analytics.mock.calls[0][0])).toContain(
        encodeURIComponent(JSON.stringify({ video_ids: [BIG_ID] }))
      );
    });

    it('missing lista os videos pelo fetch de publicacao', async () => {
      const provider = new TiktokBusinessProvider();
      const analytics = jest.spyOn(provider as any, 'analyticsFetch');
      const fetchSpy = jest.spyOn(provider, 'fetch').mockResolvedValue(
        jsonResponse({
          code: 0,
          data: {
            videos: [{ item_id: BIG_ID, thumbnail_url: 'https://cdn/t.jpg' }],
          },
        })
      );

      await expect(provider.missing('oid', 'act')).resolves.toEqual([
        { id: BIG_ID, url: 'https://cdn/t.jpg' },
      ]);
      expect(String(fetchSpy.mock.calls[0][0])).toContain(
        `${BASE}/business/video/list/?business_id=oid`
      );
      expect(analytics).not.toHaveBeenCalled();
    });

    it('post ainda com share_id nao consulta metricas', async () => {
      const provider = new TiktokBusinessProvider();
      const analytics = jest.spyOn(provider as any, 'analyticsFetch');
      await expect(
        provider.postAnalytics('oid', 'act', 'v_pub_url~1', 0)
      ).resolves.toEqual([]);
      expect(analytics).not.toHaveBeenCalled();
    });
  });
});
