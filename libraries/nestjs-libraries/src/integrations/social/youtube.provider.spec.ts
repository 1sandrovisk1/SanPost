import 'reflect-metadata';

jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn(() => ({})) },
    youtube: jest.fn(() => ({})),
    youtubeAnalytics: jest.fn(() => ({})),
    oauth2: jest.fn(() => ({})),
  },
}));

import { YoutubeProvider } from './youtube.provider';
import {
  PublishedWithError,
  RefreshToken,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';

// Lote de providers out/2026 — portes dos PRs upstream #2257 e #2294.
describe('YoutubeProvider.handleErrors', () => {
  const provider = new YoutubeProvider();

  it('cota diaria de upload esgotada vira bad-body pedindo reagendamento', () => {
    const result = provider.handleErrors(
      '{"error":{"errors":[{"domain":"youtube.quota","reason":"quotaExceeded","message":"exceeded your quota: defaultVideoInsertPerDayPerProject"}]}}'
    );
    expect(result?.type).toBe('bad-body');
    expect(result?.value).toMatch(/daily upload quota/);
  });

  it('cota diaria vence o uploadLimitExceeded quando os dois aparecem no corpo', () => {
    const result = provider.handleErrors(
      'defaultVideoInsertPerDayPerProject uploadLimitExceeded'
    );
    expect(result?.value).toMatch(/daily upload quota/);
  });

  it('thumbnail sem canal verificado explica o que fazer (video ja publicado)', () => {
    const result = provider.handleErrors(
      '{"error":{"errors":[{"domain":"youtube.thumbnail","reason":"forbidden"}]}}'
    );
    expect(result?.type).toBe('bad-body');
    expect(result?.value).toMatch(/uploaded to YouTube successfully/);
    expect(result?.value).toMatch(/youtube\.com\/verify/);
    expect(result?.value).toMatch(/YouTube Studio/);
  });

  it('mantem os mapeamentos existentes', () => {
    expect(provider.handleErrors('uploadLimitExceeded')?.value).toMatch(
      /daily upload limit/
    );
    expect(provider.handleErrors('Unauthorized')?.type).toBe('refresh-token');
    expect(provider.handleErrors('nada')).toBeUndefined();
  });
});

// upstream #1884: politica de sessao do Google Workspace (invalid_rapt) vira
// orientacao para o admin, em vez de "invalid_grant" seco no Status.
describe('YoutubeProvider.refreshErrorMessage', () => {
  it('traduz invalid_rapt em orientacao do Google Workspace', () => {
    const message = new YoutubeProvider().refreshErrorMessage({
      response: { data: { error: 'invalid_grant', error_subtype: 'invalid_rapt' } },
    });
    expect(message).toMatch(/Google Workspace/);
    expect(message).toMatch(/support\.google\.com\/a\/answer\/9368756/);
  });

  it('outros erros seguem o motivo padrao', () => {
    expect(new YoutubeProvider().refreshErrorMessage({ message: 'invalid_grant' })).toBeUndefined();
  });
});

describe('YoutubeProvider.reConnect', () => {
  const { google } = jest.requireMock('googleapis');
  beforeEach(() => {
    google.auth.OAuth2.mockImplementation(() => ({ setCredentials: jest.fn() }));
  });

  it('erro real do Google propaga em vez de virar "canal nao encontrado"', async () => {
    google.youtube.mockReturnValueOnce({
      channels: { list: jest.fn().mockRejectedValue(new Error('invalid_grant: Token has been expired')) },
    });
    await expect(new YoutubeProvider().reConnect('root', 'UC1', 'tok')).rejects.toThrow('invalid_grant');
  });

  it('canal ausente na conta continua "Channel not found"', async () => {
    google.youtube.mockReturnValueOnce({
      channels: { list: jest.fn().mockResolvedValue({ data: { items: [{ id: 'UC2' }] } }) },
    });
    await expect(new YoutubeProvider().reConnect('root', 'UC1', 'tok')).rejects.toThrow('Channel not found');
  });
});

describe('YoutubeProvider.postAnalytics', () => {
  const { google } = jest.requireMock('googleapis');
  beforeEach(() => {
    google.auth.OAuth2.mockImplementation(() => ({ setCredentials: jest.fn() }));
  });

  it('401 do Google vira RefreshToken para o checkPostAnalytics renovar', async () => {
    const unauthorized = Object.assign(new Error('Unauthorized'), {
      response: { status: 401, data: { error: 'invalid_token' } },
    });
    google.youtube.mockReturnValue({ videos: { list: jest.fn().mockRejectedValue(unauthorized) } });
    google.youtubeAnalytics.mockReturnValue({ reports: { query: jest.fn().mockRejectedValue(unauthorized) } });

    await expect(
      new YoutubeProvider().postAnalytics('id', 'tok', 'vid-1', 7)
    ).rejects.toBeInstanceOf(RefreshToken);
  });
});

// Porte do upstream #2285 + 23beddcd: capa da midia como miniatura e video no
// ar preservado quando a miniatura e recusada.
describe('YoutubeProvider.post (miniatura)', () => {
  const { google } = jest.requireMock('googleapis');
  const VIDEO = 'vid-123';

  const setup = (thumbnailsSet: jest.Mock) => {
    google.auth.OAuth2.mockImplementation(() => ({ setCredentials: jest.fn() }));
    google.youtube.mockReturnValue({
      videos: { insert: jest.fn().mockResolvedValue({ data: { id: VIDEO } }) },
      thumbnails: { set: thumbnailsSet },
    });
    const provider = new YoutubeProvider();
    const axios = jest.fn().mockResolvedValue({ data: 'stream' });
    jest.spyOn(provider as any, 'getSsrfSafeAxios').mockReturnValue(axios);
    return { provider, axios };
  };

  const post = (settings: any, media: any[]) => [
    {
      id: 'post-db-1',
      message: 'descricao',
      settings: { title: 'Titulo', type: 'public', ...settings },
      media,
    },
  ];

  it('miniatura do proprio YouTube vence a capa da midia', async () => {
    const set = jest.fn().mockResolvedValue({});
    const { provider, axios } = setup(set);

    await provider.post('id', 'tok', post({ thumbnail: { path: 'https://x/yt.png' } }, [
      { path: 'https://x/v.mp4', thumbnail: 'https://x/capa.png' },
    ]) as any);

    expect(axios).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://x/yt.png' }));
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ videoId: VIDEO }));
  });

  it('sem miniatura do YouTube usa a capa da midia; sem nenhuma nao chama thumbnails.set', async () => {
    const set = jest.fn().mockResolvedValue({});
    const { provider, axios } = setup(set);

    await provider.post('id', 'tok', post({}, [
      { path: 'https://x/v.mp4', thumbnail: 'https://x/capa.png' },
    ]) as any);
    expect(axios).toHaveBeenLastCalledWith(expect.objectContaining({ url: 'https://x/capa.png' }));

    set.mockClear();
    await expect(
      provider.post('id', 'tok', post({}, [{ path: 'https://x/v.mp4' }]) as any)
    ).resolves.toEqual([
      expect.objectContaining({ postId: VIDEO, releaseURL: `https://www.youtube.com/watch?v=${VIDEO}` }),
    ]);
    expect(set).not.toHaveBeenCalled();
  });

  it('miniatura recusada depois do upload mantem id e URL do video (PublishedWithError)', async () => {
    const set = jest
      .fn()
      .mockRejectedValue({ errors: [{ domain: 'youtube.thumbnail', reason: 'forbidden' }] });
    const { provider } = setup(set);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const err = await provider
      .post('id', 'tok', post({}, [{ path: 'https://x/v.mp4', thumbnail: 'https://x/capa.png' }]) as any)
      .catch((e) => e);

    expect(err).toBeInstanceOf(PublishedWithError);
    expect(err.postDbId).toBe('post-db-1');
    expect(err.releaseId).toBe(VIDEO);
    expect(err.releaseURL).toBe(`https://www.youtube.com/watch?v=${VIDEO}`);
    expect(err.message).toMatch(/youtube\.com\/verify/);
  });

  it('erro nao mapeado na miniatura usa a explicacao generica, nao Unknown Error', async () => {
    const set = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const { provider } = setup(set);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const err = await provider
      .post('id', 'tok', post({}, [{ path: 'https://x/v.mp4', thumbnail: 'https://x/capa.png' }]) as any)
      .catch((e) => e);

    expect(err).toBeInstanceOf(PublishedWithError);
    expect(err.message).toMatch(/Set it manually in YouTube Studio/);
  });
});

