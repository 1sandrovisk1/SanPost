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
