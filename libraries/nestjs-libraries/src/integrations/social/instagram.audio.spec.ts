import 'reflect-metadata';
import { InstagramProvider } from './instagram.provider';
import { EncryptionService } from '../../crypto/encryption.service';
import { encryptIntegrationToken } from '../../crypto/integration-token.helper';
import * as transport from '../../dtos/webhooks/ssrf.safe.dispatcher';

describe('Instagram audio', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });
  const post = (
    settings: any,
    media = [{ path: 'https://cdn.test/video.mp4' }]
  ) =>
    [
      {
        id: 'post',
        message: 'Teste',
        media,
        settings: { post_type: 'post', ...settings },
      },
    ] as any;
  it('envia audio escolhido com volume zero na criacao do Reel', async () => {
    jest.useFakeTimers();
    const p = new InstagramProvider();
    const http = jest
      .spyOn(p, 'fetch')
      .mockResolvedValueOnce({ json: async () => ({ id: 'container' }) } as any)
      .mockResolvedValueOnce({
        json: async () => ({ status_code: 'FINISHED' }),
      } as any)
      .mockResolvedValueOnce({ json: async () => ({ id: 'published' }) } as any)
      .mockResolvedValueOnce({
        json: async () => ({ permalink: 'https://instagram.com/reel/x' }),
      } as any);
    const pending = p.post(
      'ig',
      'PAGE',
      post({ audio: { id: '123', audio_volume: 0, video_volume: 100 } }, [
        { path: 'https://cdn.test/video.MP4?x=1', alt: 'Video' },
      ] as any),
      {} as any
    );
    await jest.runAllTimersAsync();
    await pending;
    expect(
      new URL(String(http.mock.calls[0][0])).searchParams.get('alt_text')
    ).toBeNull();
    expect(
      JSON.parse(
        new URL(String(http.mock.calls[0][0])).searchParams.get(
          'audio_configuration'
        )!
      )
    ).toEqual({ audio_id: '123', audio_volume: 0, video_volume: 100 });
  });
  it.each(['story', 'image', 'carousel', 'standalone'])(
    'recusa %s antes de qualquer efeito',
    async (kind) => {
      const p = new InstagramProvider();
      const http = jest.spyOn(p, 'fetch');
      const media =
        kind === 'image'
          ? [{ path: 'a.jpg' }]
          : kind === 'carousel'
          ? [{ path: 'a.mp4' }, { path: 'b.jpg' }]
          : [{ path: 'a.mp4' }];
      await expect(
        p.post(
          'ig',
          'PAGE',
          post(
            {
              post_type: kind === 'story' ? 'story' : 'post',
              audio: { id: '123' },
            },
            media
          ),
          {} as any,
          kind === 'standalone' ? 'graph.instagram.com' : undefined
        )
      ).rejects.toThrow();
      expect(http).not.toHaveBeenCalled();
    }
  );
  it('busca com User Token cifrado e internalId servidor sem entregar segredo', async () => {
    const enc = new EncryptionService();
    const p = new InstagramProvider();
    const http = jest
      .spyOn(transport, 'ssrfSafeFetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            audio: [
              { audio_id: '123', title: 'Musica', display_artist: 'Autor' },
            ],
          })
        ) as any
      );
    const integration = {
      providerIdentifier: 'instagram',
      internalId: 'owned',
      refreshToken: encryptIntegrationToken(enc, 'USER'),
      token: 'PAGE',
    } as any;
    const result = await p.audioSearch(
      'PAGE',
      { q: 'teste', user_id: 'attacker' } as any,
      'owned',
      integration
    );
    expect(String(http.mock.calls[0][0])).toContain('user_id=owned');
    expect(String(http.mock.calls[0][0])).not.toContain('attacker');
    expect((http.mock.calls[0][1] as any).headers.Authorization).toBe(
      'Bearer USER'
    );
    expect(JSON.stringify(result)).not.toContain('USER');
    expect(integration.token).toBe('PAGE');
  });
  it('canal healed sem User Token mostra orientacao sem desconectar', async () => {
    const p = new InstagramProvider();
    const http = jest.spyOn(transport, 'ssrfSafeFetch');
    await expect(
      p.audioSearch('PAGE', {}, 'owned', {
        providerIdentifier: 'instagram',
        refreshToken: 'PAGE',
      } as any)
    ).rejects.toThrow(/Facebook/);
    expect(http).not.toHaveBeenCalled();
  });
});
