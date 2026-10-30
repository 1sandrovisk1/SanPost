import { XProvider } from './x.provider';
import { BadBody, PublishedWithError } from '../social.abstract';
import * as image from './x.article.media';
describe('envio de X Articles', () => {
  let provider: XProvider;
  let client: any;
  let article: any;
  beforeEach(() => {
    provider = new XProvider();
    client = {
      v1: { uploadMedia: jest.fn() },
      v2: {
        post: jest.fn(),
        me: jest.fn().mockResolvedValue({ data: { username: 'owner' } }),
        tweet: jest.fn().mockResolvedValue({ data: { id: '55' } }),
      },
    };
    jest.spyOn(provider as any, 'getClient').mockResolvedValue(client);
    article = {
      id: 'post',
      message: '<h1>Corpo</h1><p><strong>Ola</strong></p>',
      media: [],
      settings: {
        post_type: 'article',
        article_title: 'Titulo',
        article_status: 'draft',
      },
    };
  });
  it('cria rascunho no X sem publicar e confirma ID longo', async () => {
    client.v2.post.mockResolvedValue({ data: { id: '9007199254740993123' } });
    const result = await provider.post('user', 'TOKEN', [article], {} as any);
    expect(client.v2.post).toHaveBeenCalledTimes(1);
    expect(client.v2.post.mock.calls[0][0]).toBe('articles/draft');
    expect(client.v2.post.mock.calls[0][1]).toMatchObject({
      title: 'Titulo',
      content_state: {
        blocks: [
          { type: 'header-one', text: 'Corpo' },
          { type: 'unstyled', text: 'Ola' },
        ],
      },
    });
    expect(result[0].postId).toBe('9007199254740993123');
    expect(client.v2.tweet).not.toHaveBeenCalled();
  });
  it('publica o draft criado e retorna o ID do post', async () => {
    article.settings.article_status = 'published';
    client.v2.post
      .mockResolvedValueOnce({ data: { id: '11' } })
      .mockResolvedValueOnce({ data: { post_id: '22' } });
    expect(
      (await provider.post('user', 'TOKEN', [article], {} as any))[0].postId
    ).toBe('22');
    expect(client.v2.post.mock.calls[1][0]).toBe('articles/11/publish');
  });
  it.each(['rede', 'errors', 'semID'])(
    'nao repete criacao com resultado %s',
    async (kind) => {
      if (kind === 'rede')
        client.v2.post.mockRejectedValue(new Error('token=PRIVATE'));
      else
        client.v2.post.mockResolvedValue(
          kind === 'errors' ? { data: { id: '11' }, errors: [{}] } : {}
        );
      await expect(
        provider.post('user', 'TOKEN', [article], {} as any)
      ).rejects.toBeInstanceOf(
        kind === 'errors' ? PublishedWithError : BadBody
      );
      expect(client.v2.post).toHaveBeenCalledTimes(1);
    }
  );
  it('preserva draft confirmado quando publicar falha sem expor erro cru', async () => {
    article.settings.article_status = 'published';
    client.v2.post
      .mockResolvedValueOnce({ data: { id: '11' } })
      .mockRejectedValueOnce(new Error('SECRET'));
    const error = await provider
      .post('user', 'TOKEN', [article], {} as any)
      .catch((e) => e);
    expect(error).toBeInstanceOf(PublishedWithError);
    expect(error.releaseId).toBe('11');
    expect(error.message).not.toContain('SECRET');
    expect(client.v2.post).toHaveBeenCalledTimes(2);
  });
  it('post comum continua tweet em texto e flags falsas omitidas', async () => {
    await provider.post(
      'user',
      'TOKEN',
      [
        {
          ...article,
          message: '<p>Ola</p>',
          settings: { who_can_reply_post: 'everyone', made_with_ai: false },
        },
      ],
      {} as any
    );
    expect(client.v2.tweet).toHaveBeenCalledWith({ text: 'Ola' });
    expect(client.v2.post).not.toHaveBeenCalled();
  });
  it('capa e imagens inline usam JPEG tweet_image e timeout antes do draft', async () => {
    process.env.FRONTEND_URL = 'https://app.test';
    jest.spyOn(image, 'xArticleImage').mockResolvedValue(Buffer.from('JPEG'));
    client.v1.post = jest.fn().mockResolvedValue({ media_id_string: '88' });
    article.message = '<p>Texto</p><img src="https://app.test/uploads/a.png">';
    article.settings.article_cover = {
      path: 'https://app.test/uploads/cover.png',
    };
    client.v2.post.mockResolvedValue({ data: { id: '11' } });
    await provider.post('user', 'TOKEN', [article], {} as any);
    expect(client.v1.post).toHaveBeenCalledTimes(2);
    expect(client.v1.post.mock.calls[0][1]).toMatchObject({
      media_category: 'tweet_image',
    });
    expect(client.v1.post.mock.calls[0][2].timeout).toBe(60000);
    expect(client.v2.post.mock.calls[0][1].cover_media).toEqual({
      media_category: 'tweet_image',
      media_id: '88',
    });
    jest.restoreAllMocks();
  });
});
