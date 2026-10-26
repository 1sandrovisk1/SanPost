import 'reflect-metadata';
import { ThreadsProvider } from './threads.provider';

describe('ThreadsProvider.handleErrors', () => {
  let provider: ThreadsProvider;

  beforeEach(() => {
    provider = new ThreadsProvider();
  });

  it('deve mapear midia inacessivel para bad-body', () => {
    const result = provider.handleErrors(
      'The media could not be fetched from this URI'
    );

    expect(result?.type).toBe('bad-body');
    expect(result?.value).toContain('uploaded to Postiz first');
  });

  it('deve mapear token invalido para refresh-token', () => {
    const result = provider.handleErrors('Error validating access token');

    expect(result).toEqual({
      type: 'refresh-token',
      value: 'Threads access token expired',
    });
  });

  it('deve mapear limite de 500 caracteres para bad-body', () => {
    const result = provider.handleErrors('text must be at most 500 characters');

    expect(result?.type).toBe('bad-body');
  });
});

// Lote de providers out/2026 — portes dos PRs upstream #1946, #2124 e #2150.
import { countLength, countLengthUnit } from '@gitroom/helpers/utils/count.length';

describe('ThreadsProvider (lote out/2026)', () => {
  it('4279009 (container ainda nao encontrado) vira retry', () => {
    const result = new ThreadsProvider().handleErrors(
      '{"error":{"message":"Media not found","error_subcode":4279009}}'
    );
    expect(result).toEqual({
      type: 'retry',
      value: expect.stringMatching(/try again in a few seconds/),
    });
  });

  it('container em ERROR com error_message UNKNOWN usa mensagem amigavel', async () => {
    const provider = new ThreadsProvider() as any;
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ status: 'ERROR', error_message: 'UNKNOWN' }),
      text: async () => '',
    }) as any;

    await expect(provider.checkLoaded('c-1', 'TOK')).rejects.toThrow(
      /check the media format/
    );
  });

  it('container em ERROR com detalhe real preserva o detalhe', async () => {
    const provider = new ThreadsProvider() as any;
    global.fetch = jest.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ status: 'ERROR', error_message: 'Video too long' }),
      text: async () => '',
    }) as any;

    await expect(provider.checkLoaded('c-1', 'TOK')).rejects.toThrow(/Video too long/);
  });
});

describe('countLength', () => {
  it('threads conta bytes UTF-8 (acentos e emoji pesam mais)', () => {
    expect(countLength('threads', 'abc')).toBe(3);
    expect(countLength('threads', 'ação')).toBe(6);
    expect(countLength('threads', '😀')).toBe(4);
  });

  it('x usa o peso do twitter-text e os demais contam caracteres', () => {
    expect(countLength('x', 'abc')).toBe(3);
    // URL pesa 23 no twitter-text, independentemente do tamanho real
    expect(
      countLength('x', 'veja https://example.com/um/caminho/bem/longo/mesmo')
    ).toBe(5 + 23);
    expect(countLength('facebook', 'ação')).toBe(4);
    expect(countLength('', '😀')).toBe(2);
  });

  it('variantes Zernio seguem a regra da rede de destino', () => {
    expect(countLength('zernio-threads', 'ação')).toBe(6);
    expect(
      countLength('zernio-twitter', 'veja https://example.com/um/caminho/bem/longo/mesmo')
    ).toBe(5 + 23);
    expect(countLength('zernio-facebook', 'ação')).toBe(4);
  });

  it('informa a unidade do limite para as mensagens de erro', () => {
    expect(countLengthUnit('threads')).toBe('bytes');
    expect(countLengthUnit('zernio-threads')).toBe('bytes');
    expect(countLengthUnit('x')).toBe('characters');
    expect(countLengthUnit('facebook')).toBe('characters');
  });
});
