import 'reflect-metadata';
import { VkProvider } from './vk.provider';
import { BadBody, RefreshToken } from '@gitroom/nestjs-libraries/integrations/social.abstract';

// Lote de providers out/2026 — portes dos PRs upstream #2131/#2242 e #2264.
describe('VkProvider.checkApiError', () => {
  const provider = new VkProvider();
  const check = (all: unknown) => () => (provider as any).checkApiError(all);

  it('resposta normal nao lanca', () => {
    expect(check({ response: { post_id: 1 } })).not.toThrow();
  });

  it('error_code 5 (autorizacao) vira RefreshToken', () => {
    expect(check({ error: { error_code: 5, error_msg: 'User authorization failed' } })).toThrow(RefreshToken);
  });

  it.each([6, 9, 29])('error_code %i (rate limit/flood) vira Error simples, retentavel', (code) => {
    let thrown: any;
    try {
      check({ error: { error_code: code, error_msg: 'Too many requests per second' } })();
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect(thrown).not.toBeInstanceOf(BadBody);
    expect(thrown).not.toBeInstanceOf(RefreshToken);
  });

  it('demais erros viram BadBody com a mensagem da VK', () => {
    expect(check({ error: { error_code: 100, error_msg: 'One of the parameters specified was missing' } })).toThrow(
      /parameters specified was missing/
    );
    expect(check({ error: { error_code: 100, error_msg: 'x' } })).toThrow(BadBody);
  });
});

describe('VkProvider.post / comment checam a resposta da VK', () => {
  const vkError = { error: { error_code: 100, error_msg: 'One of the parameters specified was missing', request_params: [{ key: 'access_token', value: 'SECRET' }] } };

  it('wall.post com { error } vira BadBody sem request_params', async () => {
    const provider = new VkProvider();
    jest.spyOn(provider as any, 'uploadMedia').mockResolvedValue([]);
    jest.spyOn(provider, 'fetch').mockResolvedValue({ json: async () => vkError } as any);

    let thrown: any;
    try {
      await provider.post('u1', 'TOKEN', [{ id: 'p1', message: 'oi', media: [] }] as any);
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(BadBody);
    expect(thrown.message).toMatch(/parameters specified was missing/);
    expect(JSON.stringify(thrown.details)).not.toMatch(/SECRET|request_params/);
  });

  it('wall.createComment com { error } tambem falha', async () => {
    const provider = new VkProvider();
    jest.spyOn(provider as any, 'uploadMedia').mockResolvedValue([]);
    jest.spyOn(provider, 'fetch').mockResolvedValue({ json: async () => vkError } as any);

    await expect(
      provider.comment('u1', '42', undefined, 'TOKEN', [{ id: 'c1', message: 'oi', media: [] }] as any, {} as any)
    ).rejects.toBeInstanceOf(BadBody);
  });

  it('resposta normal publica', async () => {
    const provider = new VkProvider();
    jest.spyOn(provider as any, 'uploadMedia').mockResolvedValue([]);
    jest.spyOn(provider, 'fetch').mockResolvedValue({ json: async () => ({ response: { post_id: 7 } }) } as any);

    await expect(
      provider.post('u1', 'TOKEN', [{ id: 'p1', message: 'oi', media: [] }] as any)
    ).resolves.toEqual([expect.objectContaining({ postId: '7' })]);
  });
});

describe('VkProvider dominios (.ru)', () => {
  it('generateAuthUrl aponta para id.vk.ru', async () => {
    process.env.VK_ID = 'app-1';
    process.env.FRONTEND_URL = 'https://app.example';
    const { url } = await new VkProvider().generateAuthUrl();
    expect(url.startsWith('https://id.vk.ru/authorize')).toBe(true);
  });
});
