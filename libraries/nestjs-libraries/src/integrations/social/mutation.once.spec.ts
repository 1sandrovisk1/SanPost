import { socialMutationOnce } from './mutation.once';
import * as transport from '../../dtos/webhooks/ssrf.safe.dispatcher';
describe('publicacao de tentativa unica', () => {
  afterEach(() => jest.restoreAllMocks());
  it.each(['HTML', 'oversized', 'network'])(
    'recusa resposta incerta %s sem repetir nem ecoar segredo',
    async (kind) => {
      const http = jest.spyOn(transport, 'ssrfSafeFetch');
      if (kind === 'network')
        http.mockRejectedValue(new Error('Bearer SECRET'));
      else
        http.mockResolvedValue(
          new Response(
            kind === 'HTML' ? '<html>SECRET</html>' : 'x'.repeat(129 * 1024)
          ) as any
        );
      await expect(
        socialMutationOnce(
          'tumblr',
          'https://api.tumblr.com/v2/blog/owned/posts',
          { method: 'POST', headers: { Authorization: 'Bearer SECRET' } }
        )
      ).rejects.toMatchObject({
        message: expect.not.stringContaining('SECRET'),
      });
      expect(http).toHaveBeenCalledTimes(1);
      expect(http.mock.calls[0][1]?.redirect).toBe('error');
    }
  );
});
