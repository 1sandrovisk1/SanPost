import 'reflect-metadata';
import { SlackProvider } from './slack.provider';
import { BadBody, RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';

const integration = { id: 'int-1', name: 'Bot', picture: '' } as any;
const postDetails = [{ id: 'p1', message: 'hello', media: [], settings: { channel: 'C1' } }] as any;

const mockSlack = (postMessage: unknown) => {
  global.fetch = jest.fn().mockImplementation(async (url: any) => {
    const u = String(url);
    const body = u.includes('chat.postMessage')
      ? postMessage
      : u.includes('chat.getPermalink')
      ? { ok: true, permalink: 'https://slack.example/p/1' }
      : { ok: true };
    return { json: async () => body };
  }) as any;
};

// Lote de providers out/2026 — porte do PR upstream #2117: o Slack responde
// 200 com { ok: false, error } e o post era marcado como publicado sem mensagem.
describe('SlackProvider.post', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('erro de autenticacao vira RefreshToken', async () => {
    mockSlack({ ok: false, error: 'invalid_auth' });
    await expect(new SlackProvider().post('u1', 'tok', postDetails, integration)).rejects.toBeInstanceOf(RefreshToken);
  });

  it('erro de corpo vira BadBody com o codigo e os detalhes', async () => {
    mockSlack({ ok: false, error: 'invalid_blocks', errors: ['invalid image_url'] });
    const posting = new SlackProvider().post('u1', 'tok', postDetails, integration);
    await expect(posting).rejects.toBeInstanceOf(BadBody);
    await expect(posting).rejects.toThrow(/invalid_blocks: invalid image_url/);
  });

  it('ratelimited vira Error simples (a activity retenta)', async () => {
    mockSlack({ ok: false, error: 'ratelimited' });
    let thrown: any;
    try {
      await new SlackProvider().post('u1', 'tok', postDetails, integration);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(BadBody);
  });

  it('sucesso continua devolvendo ts e permalink', async () => {
    mockSlack({ ok: true, ts: '1.2', channel: 'C1' });
    await expect(new SlackProvider().post('u1', 'tok', postDetails, integration)).resolves.toEqual([
      expect.objectContaining({ postId: '1.2', releaseURL: 'https://slack.example/p/1' }),
    ]);
  });

  it('comment tambem checa a resposta', async () => {
    mockSlack({ ok: false, error: 'channel_not_found' });
    await expect(
      new SlackProvider().comment('u1', '1.2', undefined, 'tok', postDetails, integration)
    ).rejects.toThrow(/channel_not_found/);
  });
});
