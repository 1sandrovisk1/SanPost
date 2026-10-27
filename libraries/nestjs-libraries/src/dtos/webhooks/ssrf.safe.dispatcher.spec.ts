import axios from 'axios';
import dns from 'node:dns';
import dnsPromises from 'node:dns/promises';
import http from 'node:http';
import { Agent } from 'undici';
import { AddressInfo } from 'node:net';
import {
  getSsrfSafeAxios,
  getSsrfSafeDispatcher,
  isBlockedLiteralHost,
  ssrfSafeDispatcher,
  ssrfSafeFetch,
  ssrfSafeLookup,
} from './ssrf.safe.dispatcher';
import { isSafePublicHttpsUrl } from './webhook.url.validator';

jest.mock('node:dns', () => ({
  __esModule: true,
  default: {
    lookup: jest.fn(),
  },
}));

jest.mock('node:dns/promises', () => ({
  __esModule: true,
  default: {
    lookup: jest.fn(),
  },
}));

type LookupResult = {
  address: string | Array<{ address: string; family: number }>;
  family?: number;
};

const runLookup = (hostname: string, options: Record<string, unknown> = {}) =>
  new Promise<LookupResult>((resolve, reject) => {
    ssrfSafeLookup(hostname, options, (error, address, family) => {
      if (error) {
        reject(error);
        return;
      }

      resolve({ address, family });
    });
  });

describe('ssrf.safe.dispatcher', () => {
  const originalDisableSsrf = process.env.DISABLE_SSRF_PROTECTION;
  const dnsLookup = dns.lookup as unknown as jest.Mock;
  const dnsPromisesLookup = dnsPromises.lookup as jest.Mock;

  beforeEach(() => {
    delete process.env.DISABLE_SSRF_PROTECTION;
    dnsLookup.mockReset();
    dnsPromisesLookup.mockReset();
  });

  afterAll(() => {
    if (originalDisableSsrf === undefined) {
      delete process.env.DISABLE_SSRF_PROTECTION;
      return;
    }

    process.env.DISABLE_SSRF_PROTECTION = originalDisableSsrf;
  });

  it('bloqueia IPv4 privado informado literalmente', async () => {
    await expect(runLookup('169.254.169.254')).rejects.toThrow('Blocked IP');
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it('bloqueia faixas IPv4 especiais que nao sao destinos publicos', async () => {
    await expect(runLookup('192.0.2.1')).rejects.toThrow('Blocked IP');
    await expect(runLookup('198.51.100.1')).rejects.toThrow('Blocked IP');
    await expect(runLookup('203.0.113.1')).rejects.toThrow('Blocked IP');
  });

  it('bloqueia IPv6 privado informado literalmente', async () => {
    await expect(runLookup('fd00::1')).rejects.toThrow('Blocked IP');
    expect(dnsLookup).not.toHaveBeenCalled();
  });

  it('bloqueia toda a faixa IPv6 link-local fe80::/10', async () => {
    await expect(runLookup('fe90::1')).rejects.toThrow('Blocked IP');
    await expect(runLookup('febf::1')).rejects.toThrow('Blocked IP');
  });

  it('bloqueia IPv4 privado mapeado em IPv6 hexadecimal', async () => {
    await expect(runLookup('::ffff:7f00:1')).rejects.toThrow('Blocked IP');
  });

  it('bloqueia prefixos IPv6 que podem traduzir ou encapsular IPv4', async () => {
    await expect(runLookup('64:ff9b::a00:1')).rejects.toThrow('Blocked IP');
    await expect(runLookup('2001:0:a00:1::1')).rejects.toThrow('Blocked IP');
  });

  it('aceita IP publico informado literalmente', async () => {
    await expect(runLookup('1.1.1.1')).resolves.toEqual({
      address: '1.1.1.1',
      family: 4,
    });
  });

  it('aceita IPv6 publico informado literalmente', async () => {
    await expect(runLookup('2606:4700:4700::1111')).resolves.toEqual({
      address: '2606:4700:4700::1111',
      family: 6,
    });
  });

  it('bloqueia resposta DNS mista quando qualquer endereco e privado', async () => {
    dnsLookup.mockImplementationOnce(
      (_hostname, _options, callback: (...args: unknown[]) => void) =>
        callback(
          null,
          [
            { address: '1.1.1.1', family: 4 },
            { address: '10.0.0.8', family: 4 },
          ],
          0
        )
    );

    await expect(runLookup('mixed.example', { all: true })).rejects.toThrow(
      'Blocked IP'
    );
  });

  it('bloqueia DNS rebinding no lookup da conexao depois da validacao inicial', async () => {
    dnsPromisesLookup.mockResolvedValueOnce([
      { address: '1.1.1.1', family: 4 },
    ]);
    dnsLookup.mockImplementationOnce(
      (_hostname, _options, callback: (...args: unknown[]) => void) =>
        callback(null, '127.0.0.1', 4)
    );

    await expect(
      isSafePublicHttpsUrl('https://rebinding.example/media.jpg')
    ).resolves.toBe(true);
    await expect(runLookup('rebinding.example')).rejects.toThrow('Blocked IP');
  });

  it('revalida o DNS do destino de redirect e bloqueia IP privado', async () => {
    dnsLookup
      .mockImplementationOnce(
        (_hostname, _options, callback: (...args: unknown[]) => void) =>
          callback(null, '1.1.1.1', 4)
      )
      .mockImplementationOnce(
        (_hostname, _options, callback: (...args: unknown[]) => void) =>
          callback(null, '10.0.0.9', 4)
      );

    await expect(runLookup('public.example')).resolves.toEqual({
      address: '1.1.1.1',
      family: 4,
    });
    await expect(runLookup('redirect-target.example')).rejects.toThrow(
      'Blocked IP'
    );
  });

  it('usa o mesmo lookup pinado nos clientes Undici e Axios', () => {
    const safeAxios = getSsrfSafeAxios();

    expect(getSsrfSafeDispatcher()).toBe(ssrfSafeDispatcher);
    expect(safeAxios).not.toBe(axios);
    expect(safeAxios.defaults.proxy).toBe(false);
    expect(safeAxios.defaults.httpAgent.options.lookup).toBe(ssrfSafeLookup);
    expect(safeAxios.defaults.httpsAgent.options.lookup).toBe(ssrfSafeLookup);
  });

  it('libera o opt-out self-hosted somente quando configurado explicitamente', () => {
    process.env.DISABLE_SSRF_PROTECTION = 'true';

    expect(getSsrfSafeDispatcher()).toBeUndefined();
    expect(getSsrfSafeAxios()).toBe(axios);
  });

  // `net.connect` pula `options.lookup` quando o host ja e um IP literal, entao
  // um guard que vive so no lookup nunca roda para `http://127.0.0.1/`,
  // `http://[::1]/` ou um redirect para IP. A conferencia precisa acontecer
  // tambem na abertura da conexao (undici `connect` e `createConnection` do
  // http/https Agent do axios).
  describe('host em IP literal (sem lookup)', () => {
    let server: http.Server;
    let hits = 0;
    let baseUrl = '';

    beforeAll(async () => {
      server = http.createServer((_req, res) => {
        hits += 1;
        res.end('reached');
      });
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', () => resolve())
      );
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('fetch com o dispatcher pinado nao conecta em 127.0.0.1 literal', async () => {
      const error = (await ssrfSafeFetch(baseUrl).catch((e) => e)) as Error & {
        cause?: Error;
      };

      // o TypeError do undici vem do realm do Node (sem instanceof no sandbox)
      expect(error?.message).toBe('fetch failed');
      expect(error?.cause?.message).toBe('Blocked IP');
      expect(hits).toBe(0);
    });

    it('fetch para [::1] literal e recusado antes de qualquer conexao', async () => {
      // sem servidor na porta: um guard ausente daria ECONNREFUSED, nao
      // "Blocked IP" (porta alta para nao cair na lista de "bad port" do fetch)
      const error = (await ssrfSafeFetch('http://[::1]:65123/').catch(
        (e) => e
      )) as Error & { cause?: Error };

      expect(error?.cause?.message).toBe('Blocked IP');
    });

    it('fetch com nome que resolve para IP privado segue bloqueado (lookup pinado no connector)', async () => {
      dnsLookup.mockImplementation(
        (_hostname, _options, callback: (...args: unknown[]) => void) =>
          callback(null, '127.0.0.1', 4)
      );
      const port = (server.address() as AddressInfo).port;

      const error = (await ssrfSafeFetch(`http://private.example:${port}/`).catch(
        (e) => e
      )) as Error & { cause?: Error };

      expect(error?.cause?.message).toBe('Blocked IP');
      expect(dnsLookup).toHaveBeenCalledWith(
        'private.example',
        expect.anything(),
        expect.any(Function)
      );
      expect(hits).toBe(0);
    });

    it('fetch https para [::1] literal e recusado antes do TLS', async () => {
      const error = (await ssrfSafeFetch('https://[::1]:65123/').catch(
        (e) => e
      )) as Error & { cause?: Error };

      expect(error?.cause?.message).toBe('Blocked IP');
    });

    it('fetch aceita o proprio dispatcher pinado (forca o guard sob opt-out) e recusa outro', async () => {
      const pinned = (await ssrfSafeFetch(baseUrl, {
        dispatcher: ssrfSafeDispatcher,
      }).catch((e) => e)) as Error & { cause?: Error };
      expect(pinned?.cause?.message).toBe('Blocked IP');

      const foreign = new Agent();
      await expect(
        ssrfSafeFetch(baseUrl, { dispatcher: foreign })
      ).rejects.toThrow('pinned dispatcher');
      await foreign.close();
      expect(hits).toBe(0);
    });

    it('agente https pinado recusa IP literal no createConnection (ramo TLS)', async () => {
      const httpsAgent = getSsrfSafeAxios().defaults.httpsAgent as unknown as {
        createConnection: (
          options: { host: string; port: number },
          callback: (error: Error | null) => void
        ) => unknown;
      };

      const error = await new Promise<Error | null>((resolve) =>
        httpsAgent.createConnection(
          { host: '127.0.0.1', port: 443 },
          (err) => resolve(err)
        )
      );

      expect(error?.message).toBe('Blocked IP');
    });

    it.each([
      [{ socketPath: '/tmp/x.sock' }],
      [{ httpVersion: 2 }],
      [{ proxy: { host: '127.0.0.1', port: 8080 } }],
      [{ httpAgent: new http.Agent() }],
    ])('axios pinado recusa override de transporte %j', async (override) => {
      await expect(
        getSsrfSafeAxios().get(baseUrl, override as Record<string, unknown>)
      ).rejects.toThrow('transport overrides');
      expect(hits).toBe(0);
    });

    it('axios pinado nao conecta em 127.0.0.1 literal', async () => {
      await expect(getSsrfSafeAxios().get(baseUrl)).rejects.toThrow(
        'Blocked IP'
      );
      expect(hits).toBe(0);
    });

    it.each([
      '127.0.0.1',
      '[::1]',
      '::1',
      '::ffff:127.0.0.1',
      '169.254.169.254',
      '10.0.0.8',
    ])('isBlockedLiteralHost bloqueia %s', (host) => {
      expect(isBlockedLiteralHost(host)).toBe(true);
    });

    it.each(['1.1.1.1', '[2606:4700:4700::1111]', 'example.com', ''])(
      'isBlockedLiteralHost deixa "%s" para o lookup pinado',
      (host) => {
        expect(isBlockedLiteralHost(host)).toBe(false);
      }
    );
  });
});
