jest.mock('@zernio/node', () => ({ __esModule: true, default: jest.fn() }));
jest.mock('@gitroom/nestjs-libraries/redis/redis.service', () => ({
  ioRedis: {},
}));
import Zernio from '@zernio/node';
import { ZernioBaseProvider } from './zernio.base.provider';
import { BadBody } from '../social.abstract';

describe('ZernioBaseProvider V112', () => {
  let provider: ZernioBaseProvider;
  const createPost = jest.fn();
  const getPost = jest.fn();
  beforeEach(() => {
    jest.clearAllMocks();
    (Zernio as unknown as jest.Mock).mockImplementation(() => ({
      posts: { createPost, getPost },
    }));
    provider = new ZernioBaseProvider('tiktok', 'TikTok', 2200);
    jest.spyOn(provider as any, 'checkUsage').mockResolvedValue({});
  });
  const publish = () =>
    provider.postPending(
      'account',
      'SECRET',
      [{ id: 'db-post', message: 'oi', settings: {}, media: [] }],
      {} as any
    );
  it('envia uma vez e guarda apenas id no pendingData', async () => {
    createPost.mockResolvedValue({
      data: { post: { _id: 'remote', status: 'publishing' } },
    });
    expect(await publish()).toEqual([
      {
        id: 'db-post',
        postId: 'remote',
        releaseURL: '',
        status: 'pending',
        pendingData: { postId: 'remote' },
      },
    ]);
    expect(createPost).toHaveBeenCalledTimes(1);
    expect(getPost).not.toHaveBeenCalled();
  });
  it.each(['publishing', 'scheduled', 'unknown', undefined])(
    'nao confirma estado %s nem reenvia',
    async (status) => {
      getPost.mockResolvedValue({ data: { post: { status } } });
      expect(
        await provider.checkPostStatus(
          'SECRET',
          { postId: 'remote' },
          {} as any
        )
      ).toEqual({ status: 'pending', pendingData: { postId: 'remote' } });
      expect(createPost).not.toHaveBeenCalled();
    }
  );
  it('confirma apenas published preservando id Zernio e URL', async () => {
    getPost.mockResolvedValue({
      data: {
        post: {
          status: 'published',
          platforms: [
            {
              platform: 'tiktok',
              platformPostUrl: 'https://tiktok.com/video/1',
            },
          ],
        },
      },
    });
    expect(
      await provider.checkPostStatus('SECRET', { postId: 'remote' }, {} as any)
    ).toEqual({
      status: 'completed',
      postId: 'remote',
      releaseURL: 'https://tiktok.com/video/1',
    });
  });
  it.each(['failed', 'partial', 'cancelled'])(
    'encerra %s sem nova publicacao',
    async (status) => {
      getPost.mockResolvedValue({ data: { post: { status } } });
      await expect(
        provider.checkPostStatus('SECRET', { postId: 'remote' }, {} as any)
      ).rejects.toBeInstanceOf(BadBody);
      expect(createPost).not.toHaveBeenCalled();
    }
  );
  it.each(['failed', 'partial'])(
    'aceite inicial %s nao repete createPost e aguarda consulta',
    async (status) => {
      createPost.mockResolvedValue({
        data: { post: { _id: 'remote', status } },
        response: { status: 207 },
      });
      const result = await publish();
      expect(result[0].status).toBe('pending');
      getPost.mockResolvedValue({ data: { post: { status } } });
      await expect(
        provider.checkPostStatus('SECRET', result[0].pendingData, {} as any)
      ).rejects.toBeInstanceOf(BadBody);
      expect(createPost).toHaveBeenCalledTimes(1);
    }
  );
  it('resposta aceita sem identificador nao vira sucesso nem nova tentativa', async () => {
    createPost.mockResolvedValue({ data: {} });
    await expect(publish()).rejects.toBeInstanceOf(BadBody);
    expect(createPost).toHaveBeenCalledTimes(1);
  });
});
