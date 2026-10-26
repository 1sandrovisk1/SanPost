import 'reflect-metadata';
import { HashnodeProvider } from './hashnode.provider';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';

const JAVASCRIPT_TAG_ID = '56744721958ef13879b94cad';
const postDetails = (settings: Record<string, unknown>) =>
  [{ id: 'p1', message: '# md', media: [], settings }] as any;

// Lote de providers out/2026 — porte do PR upstream #2108 (migracao da API).
describe('HashnodeProvider.post', () => {
  it('publica em gql-beta com tags por slug (ids desconhecidos ignorados) e coverImage', async () => {
    const provider = new HashnodeProvider();
    const fetchSpy = jest.spyOn(provider, 'fetch').mockResolvedValue({
      json: async () => ({ data: { publishPost: { post: { id: 'h1', url: 'https://h.example/x' } } } }),
    } as any);

    const result = await provider.post(
      'id',
      'tok',
      postDetails({
        title: 'T',
        publication: 'pub',
        tags: [{ value: JAVASCRIPT_TAG_ID }, { value: 'unknown-id' }],
        main_image: { path: 'https://img.example/x.png' },
      }),
      {} as any
    );

    expect(result[0]).toMatchObject({ postId: 'h1', releaseURL: 'https://h.example/x' });
    expect(String(fetchSpy.mock.calls[0][0])).toBe('https://gql-beta.hashnode.com');
    const body = String(fetchSpy.mock.calls[0][1]?.body);
    expect(body).toMatch(/slug: \\\\?"javascript\\\\?"/);
    expect(body).not.toMatch(/unknown-id/);
    expect(body).toMatch(/coverImage: /);
    expect(body).not.toMatch(/coverImageOptions/);
  });

  it('errors do GraphQL viram BadBody com a mensagem', async () => {
    const provider = new HashnodeProvider();
    jest.spyOn(provider, 'fetch').mockResolvedValue({
      json: async () => ({ errors: [{ message: 'Publication not found' }] }),
    } as any);

    const posting = provider.post('id', 'tok', postDetails({ title: 'T', publication: 'x', tags: [] }), {} as any);
    await expect(posting).rejects.toBeInstanceOf(BadBody);
    await expect(posting).rejects.toThrow(/Publication not found/);
  });
});
