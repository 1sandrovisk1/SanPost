import 'reflect-metadata';

jest.mock('ws', () => {
  const instances: any[] = [];
  const WebSocketMock = jest.fn().mockImplementation(() => {
    const handlers: Record<string, (data?: any) => void> = {};
    const instance = {
      on: jest.fn((event: string, cb: (data?: any) => void) => {
        handlers[event] = cb;
      }),
      close: jest.fn(),
      emit: (event: string, data?: any) => handlers[event]?.(data),
    };
    instances.push(instance);
    return instance;
  });
  (WebSocketMock as any).instances = instances;
  return { __esModule: true, default: WebSocketMock, WebSocket: WebSocketMock };
});
jest.mock('@gitroom/helpers/utils/timer', () => ({ timer: jest.fn() }));

import WebSocket from 'ws';
import { timer } from '@gitroom/helpers/utils/timer';
import { RedditProvider, normalizeSubreddit } from './reddit.provider';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';

const response = (body: unknown) =>
  ({ status: 200, ok: true, json: async () => body, text: async () => JSON.stringify(body) } as any);

const postDetails = (subs = ['/r/Foo/']) =>
  [
    {
      id: 'p1',
      message: 'hello',
      media: [],
      settings: {
        subreddit: subs.map((s) => ({ value: { subreddit: s, title: 't', type: 'self' } })),
      },
    },
  ] as any;

const submitted = { json: { data: { id: 'abc', name: 't3_abc', url: 'https://www.reddit.com/r/foo/comments/abc/x/' } } };
const ratelimit = (msg: string) => ({ json: { errors: [['RATELIMIT', msg, 'ratelimit']] } });

// Lote de providers out/2026 — portes dos PRs upstream #1930, #2116 e #2126
// (+ a checagem de json.errors que o fork nao tinha).
describe('normalizeSubreddit', () => {
  it.each([
    ['r/Foo', 'foo'],
    ['/r/Foo/', 'foo'],
    ['https://www.reddit.com/r/Foo', 'foo'],
    ['foo', 'foo'],
    [' /r/Foo ', 'foo'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeSubreddit(input)).toBe(expected);
  });
});

describe('RedditProvider.post', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('json.errors do Reddit vira BadBody com a mensagem (antes: TypeError em websocket_url)', async () => {
    const provider = new RedditProvider();
    jest.spyOn(provider, 'fetch').mockResolvedValue(
      response({ json: { errors: [['SUBREDDIT_NOEXIST', 'that subreddit does not exist', 'sr']] } })
    );

    const posting = provider.post('u1', 'TOKEN', postDetails());
    await expect(posting).rejects.toBeInstanceOf(BadBody);
    await expect(posting).rejects.toThrow(/that subreddit does not exist/);
  });

  it('RATELIMIT dentro do orcamento espera o tempo da mensagem e reenvia o mesmo subreddit', async () => {
    const provider = new RedditProvider();
    const fetchSpy = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce(response(ratelimit('you are doing that too much. try again in 2 minutes.')))
      .mockResolvedValueOnce(response(submitted));

    await expect(provider.post('u1', 'TOKEN', postDetails())).resolves.toEqual([
      { id: 'p1', postId: 'abc', releaseURL: 'https://www.reddit.com/r/foo/comments/abc/x/', status: 'published' },
    ]);
    expect(timer).toHaveBeenCalledWith(120000);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('RATELIMIT acima do orcamento da activity falha com BadBody sem esperar', async () => {
    const provider = new RedditProvider();
    jest
      .spyOn(provider, 'fetch')
      .mockResolvedValue(response(ratelimit('you are doing that too much. try again in 9 minutes.')));

    const posting = provider.post('u1', 'TOKEN', postDetails());
    await expect(posting).rejects.toBeInstanceOf(BadBody);
    await expect(posting).rejects.toThrow(/rate limit/i);
    expect(timer).not.toHaveBeenCalledWith(540000);
  });

  it('redirect pelo websocket resolve o id e fecha o socket', async () => {
    const provider = new RedditProvider();
    jest
      .spyOn(provider, 'fetch')
      .mockResolvedValue(response({ json: { data: { websocket_url: 'wss://reddit.example/ws' } } }));

    const posting = provider.post('u1', 'TOKEN', postDetails());
    await new Promise((r) => setImmediate(r));
    const socket = (WebSocket as any).instances.at(-1);
    socket.emit(
      'message',
      JSON.stringify({ payload: { redirect: 'https://www.reddit.com/r/foo/comments/xyz/titulo/' } })
    );

    await expect(posting).resolves.toEqual([
      expect.objectContaining({ postId: 'xyz', releaseURL: 'https://www.reddit.com/r/foo/comments/xyz/titulo/' }),
    ]);
    expect(socket.close).toHaveBeenCalledTimes(1);
  });

  it('websocket mudo (ou com erro) desiste em 30 s e fecha o socket', async () => {
    jest.useFakeTimers();
    try {
      const provider = new RedditProvider();
      jest
        .spyOn(provider, 'fetch')
        .mockResolvedValue(response({ json: { data: { websocket_url: 'wss://reddit.example/ws' } } }));

      const posting = provider.post('u1', 'TOKEN', postDetails());
      await jest.advanceTimersByTimeAsync(30_000);
      await expect(posting).resolves.toEqual([expect.objectContaining({ postId: '' })]);
      expect((WebSocket as any).instances.at(-1).close).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('o orcamento e compartilhado entre subreddits e o BadBody lista o que ja saiu', async () => {
    const provider = new RedditProvider();
    jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce(response(submitted))
      .mockResolvedValue(response(ratelimit('you are doing that too much. try again in 9 minutes.')));

    const posting = provider.post('u1', 'TOKEN', postDetails(['/r/Foo/', '/r/Bar/']));
    await expect(posting).rejects.toThrow(/already published: https:\/\/www\.reddit\.com\/r\/foo\/comments\/abc/);
  });

  it('resposta com id nao abre websocket', async () => {
    const provider = new RedditProvider();
    jest.spyOn(provider, 'fetch').mockResolvedValue(response(submitted));

    await provider.post('u1', 'TOKEN', postDetails());
    expect(WebSocket).not.toHaveBeenCalled();
  });

  it('sr e normalizado a partir do valor do picker (/r/Foo/)', async () => {
    const provider = new RedditProvider();
    const fetchSpy = jest.spyOn(provider, 'fetch').mockResolvedValue(response(submitted));

    await provider.post('u1', 'TOKEN', postDetails(['/r/Foo/']));
    const body = fetchSpy.mock.calls[0][1]?.body as URLSearchParams;
    expect(body.get('sr')).toBe('foo');
  });
});

describe('RedditProvider.subreddits (busca por nome)', () => {
  it('r/nome ou URL procura pelo nome e poe o subreddit exato em primeiro, sem duplicar', async () => {
    const provider = new RedditProvider();
    const calls: string[] = [];
    jest.spyOn(provider, 'fetch').mockImplementation(async (url: any) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('/r/Foo/about')) {
        return response({
          kind: 't5',
          data: { id: 't5_1', title: 'Foo', url: '/r/Foo/', subreddit_type: 'public', submission_type: 'any' },
        });
      }
      return response({
        data: {
          children: [
            { data: { id: 'other', title: 'Foobar', url: '/r/Foobar/', subreddit_type: 'public', submission_type: 'any' } },
            { data: { id: 't5_1', title: 'Foo', url: '/r/Foo/', subreddit_type: 'public', submission_type: 'any' } },
          ],
        },
      });
    });

    const result = await provider.subreddits('TOKEN', { word: 'https://www.reddit.com/r/Foo' });
    expect(result.map((r: any) => r.id)).toEqual(['t5_1', 'other']);
    expect(calls.some((u) => u.includes('q=Foo'))).toBe(true);
  });

  it('subreddit exato inexistente (erro na consulta) nao derruba a busca', async () => {
    const provider = new RedditProvider();
    jest.spyOn(provider, 'fetch').mockImplementation(async (url: any) => {
      if (String(url).includes('/about')) {
        throw new BadBody('reddit', '{}', '{}', 'not found');
      }
      return response({ data: { children: [] } });
    });

    await expect(provider.subreddits('TOKEN', { word: 'r/Nope' })).resolves.toEqual([]);
  });
});
