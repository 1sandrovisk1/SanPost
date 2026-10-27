jest.mock('@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator', () => ({
  ...jest.requireActual(
    '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator'
  ),
  isSafePublicHttpsUrl: jest.fn(),
}));

import http from 'node:http';
import { AddressInfo } from 'node:net';
import {
  decodeText,
  fetchPublicUrl,
  PublicUrlFetchError,
} from './public-url.fetch';
import { isSafePublicHttpsUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';
import { ssrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

const mockIsSafe = isSafePublicHttpsUrl as jest.Mock;

const streamOf = (chunks: number[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const size of chunks) {
        controller.enqueue(new Uint8Array(size));
      }
      controller.close();
    },
  });

const reasonOf = async (promise: Promise<unknown>) => {
  const error = await promise.catch((e) => e);
  expect(error).toBeInstanceOf(PublicUrlFetchError);
  return (error as PublicUrlFetchError).reason;
};

// Download de URL informada por terceiros (imagem de referencia da IA, feed e
// artigo do autopost, upload por URL): sempre pelo dispatcher pinado, com
// timeout e limite de bytes.
describe('fetchPublicUrl', () => {
  const originalFetch = globalThis.fetch;
  const originalOptOut = process.env.DISABLE_SSRF_PROTECTION;

  beforeEach(() => {
    mockIsSafe.mockReset();
    delete process.env.DISABLE_SSRF_PROTECTION;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalOptOut === undefined) {
      delete process.env.DISABLE_SSRF_PROTECTION;
    } else {
      process.env.DISABLE_SSRF_PROTECTION = originalOptOut;
    }
  });

  it('baixa URL https publica pelo dispatcher pinado com timeout', async () => {
    mockIsSafe.mockResolvedValue(true);
    const fetchSpy = jest.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'image/png' },
      })
    );
    globalThis.fetch = fetchSpy as any;

    const result = await fetchPublicUrl('https://cdn.example.com/a.png', {
      maxBytes: 10,
    });

    expect(result.buffer).toEqual(Buffer.from([1, 2, 3]));
    expect(result.contentType).toBe('image/png');
    const [url, init] = fetchSpy.mock.calls[0] as any;
    expect(url).toBe('https://cdn.example.com/a.png');
    expect(init.dispatcher).toBe(ssrfSafeDispatcher);
    expect(init.signal).toBeDefined();
  });

  it('recusa https que nao resolve para endereco publico sem chamar fetch', async () => {
    mockIsSafe.mockResolvedValue(false);
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as any;

    expect(
      await reasonOf(fetchPublicUrl('https://intranet.example/', { maxBytes: 10 }))
    ).toBe('unsafe');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each(['http://example.com/a', 'ftp://example.com/a', 'file:///etc/passwd', 'nao-e-url'])(
    'recusa %s quando so https e permitido',
    async (url) => {
      const fetchSpy = jest.fn();
      globalThis.fetch = fetchSpy as any;

      expect(await reasonOf(fetchPublicUrl(url, { maxBytes: 10 }))).toBe('unsafe');
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  it('aceita http quando allowHttp, ainda pelo dispatcher pinado', async () => {
    const fetchSpy = jest.fn(async () => new Response('ok', { status: 200 }));
    globalThis.fetch = fetchSpy as any;

    await fetchPublicUrl('http://blog.example.com/post', {
      maxBytes: 10,
      allowHttp: true,
    });

    expect((fetchSpy.mock.calls[0] as any)[1].dispatcher).toBe(ssrfSafeDispatcher);
  });

  it('HTTP nao-2xx vira reason http com o status', async () => {
    mockIsSafe.mockResolvedValue(true);
    globalThis.fetch = jest.fn(async () => new Response('x', { status: 404 })) as any;

    const error = (await fetchPublicUrl('https://example.com/x', {
      maxBytes: 10,
    }).catch((e) => e)) as PublicUrlFetchError;

    expect(error.reason).toBe('http');
    expect(error.status).toBe(404);
  });

  it('content-length acima do limite falha sem ler o corpo', async () => {
    mockIsSafe.mockResolvedValue(true);
    globalThis.fetch = jest.fn(async () =>
      new Response(streamOf([4]), {
        status: 200,
        headers: { 'content-length': '999999' },
      })
    ) as any;

    expect(
      await reasonOf(fetchPublicUrl('https://example.com/big', { maxBytes: 10 }))
    ).toBe('too-large');
  });

  it('corpo sem content-length que passa do limite e interrompido', async () => {
    mockIsSafe.mockResolvedValue(true);
    globalThis.fetch = jest.fn(async () =>
      new Response(streamOf([6, 6, 6]), { status: 200 })
    ) as any;

    expect(
      await reasonOf(fetchPublicUrl('https://example.com/stream', { maxBytes: 10 }))
    ).toBe('too-large');
  });

  it('bloqueio na conexao (Blocked IP) vira reason unsafe; outras falhas viram network', async () => {
    mockIsSafe.mockResolvedValue(true);
    globalThis.fetch = jest.fn(async () => {
      throw Object.assign(new TypeError('fetch failed'), {
        cause: new Error('Blocked IP'),
      });
    }) as any;
    expect(
      await reasonOf(fetchPublicUrl('https://rebind.example/', { maxBytes: 10 }))
    ).toBe('unsafe');

    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('fetch failed');
    }) as any;
    expect(
      await reasonOf(fetchPublicUrl('https://down.example/', { maxBytes: 10 }))
    ).toBe('network');
  });

  it('opt-out self-hosted so vale quando o chamador permite', async () => {
    process.env.DISABLE_SSRF_PROTECTION = 'true';
    mockIsSafe.mockResolvedValue(false);
    const fetchSpy = jest.fn(async () => new Response('ok', { status: 200 }));
    globalThis.fetch = fetchSpy as any;

    await fetchPublicUrl('https://feed.intranet/rss', {
      maxBytes: 10,
      honorSsrfOptOut: true,
    });
    expect((fetchSpy.mock.calls[0] as any)[1].dispatcher).toBeUndefined();

    expect(
      await reasonOf(fetchPublicUrl('https://feed.intranet/rss', { maxBytes: 10 }))
    ).toBe('unsafe');
  });

  it('cada redirect e revalidado: https -> http sem allowHttp e recusado', async () => {
    mockIsSafe.mockResolvedValue(true);
    const fetchSpy = jest.fn(async () =>
      new Response(null, { status: 302, headers: { location: 'http://cdn.example.com/a' } })
    );
    globalThis.fetch = fetchSpy as any;

    expect(
      await reasonOf(fetchPublicUrl('https://example.com/a', { maxBytes: 10 }))
    ).toBe('unsafe');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect((fetchSpy.mock.calls[0] as any)[1].redirect).toBe('manual');
  });

  it('redirect para host que nao resolve publico e recusado antes de conectar', async () => {
    mockIsSafe.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const fetchSpy = jest.fn(async () =>
      new Response(null, { status: 301, headers: { location: 'https://intranet.example/x' } })
    );
    globalThis.fetch = fetchSpy as any;

    expect(
      await reasonOf(fetchPublicUrl('https://example.com/a', { maxBytes: 10 }))
    ).toBe('unsafe');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockIsSafe).toHaveBeenLastCalledWith('https://intranet.example/x');
  });

  it('segue redirect valido (relativo) e devolve o corpo final; mais de 5 saltos falha', async () => {
    mockIsSafe.mockResolvedValue(true);
    globalThis.fetch = jest
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/final' } }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 })) as any;
    const result = await fetchPublicUrl('https://example.com/a', { maxBytes: 10 });
    expect(result.buffer.toString()).toBe('ok');
    expect(((globalThis.fetch as jest.Mock).mock.calls[1] as any)[0]).toBe('https://example.com/final');

    globalThis.fetch = jest.fn(async () =>
      new Response(null, { status: 302, headers: { location: '/loop' } })
    ) as any;
    expect(
      await reasonOf(fetchPublicUrl('https://example.com/a', { maxBytes: 10 }))
    ).toBe('http');
    expect(globalThis.fetch).toHaveBeenCalledTimes(6);
  });

  it('envia os headers pedidos pelo chamador', async () => {
    mockIsSafe.mockResolvedValue(true);
    const fetchSpy = jest.fn(async () => new Response('ok', { status: 200 }));
    globalThis.fetch = fetchSpy as any;

    await fetchPublicUrl('https://example.com/feed', {
      maxBytes: 10,
      headers: { 'User-Agent': 'RoboMultipost/1.0', Accept: 'application/rss+xml' },
    });

    expect((fetchSpy.mock.calls[0] as any)[1].headers).toEqual({
      'User-Agent': 'RoboMultipost/1.0',
      Accept: 'application/rss+xml',
    });
  });

  it('timeout no meio do corpo vira reason network', async () => {
    mockIsSafe.mockResolvedValue(true);
    globalThis.fetch = jest.fn(async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(2));
            controller.error(new DOMException('The operation timed out.', 'TimeoutError'));
          },
        }),
        { status: 200 }
      )
    ) as any;

    expect(
      await reasonOf(fetchPublicUrl('https://example.com/slow', { maxBytes: 10 }))
    ).toBe('network');
  });

  it('opt-out vale so para a URL configurada: redirect do feed volta ao guard', async () => {
    process.env.DISABLE_SSRF_PROTECTION = 'true';
    mockIsSafe.mockResolvedValue(false);
    const fetchSpy = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: 'https://10.0.0.5/admin' } })
      );
    globalThis.fetch = fetchSpy as any;

    expect(
      await reasonOf(
        fetchPublicUrl('https://feed.intranet/rss', { maxBytes: 10, honorSsrfOptOut: true })
      )
    ).toBe('unsafe');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(mockIsSafe).toHaveBeenCalledWith('https://10.0.0.5/admin');
  });

  it('servidor em 127.0.0.1 nao e alcancado (guard na conexao, fetch real)', async () => {
    let hits = 0;
    const server = http.createServer((_req, res) => {
      hits += 1;
      res.end('reached');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const { port } = server.address() as AddressInfo;
    try {
      expect(
        await reasonOf(
          fetchPublicUrl(`http://127.0.0.1:${port}/`, { maxBytes: 10, allowHttp: true })
        )
      ).toBe('unsafe');
      expect(hits).toBe(0);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('decodeText', () => {
  it('respeita o charset do content-type e cai para utf-8 quando invalido', () => {
    const latin1 = Buffer.from([0x63, 0x61, 0x66, 0xe9]);
    expect(decodeText(latin1, 'application/rss+xml; charset=ISO-8859-1')).toBe('café');
    expect(decodeText(Buffer.from('café'), 'text/xml; charset=nao-existe')).toBe('café');
    expect(decodeText(Buffer.from('café'), '')).toBe('café');
  });
});
