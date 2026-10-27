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
import { RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';

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
