import { ValidationPipe } from '@nestjs/common';
import { ProviderPageDto } from './provider.page.dto';

// mesma pipe das rotas de conexao: whitelist descarta campos desconhecidos
const pipe = new ValidationPipe({ whitelist: true, transform: true });
const run = (body: unknown) =>
  pipe.transform(body, { type: 'body', metatype: ProviderPageDto });

describe('ProviderPageDto', () => {
  it('mantem so os campos da escolha da pagina e converte id numerico', async () => {
    const result = await run({
      state: 's',
      page: 123,
      id: 'acc/1',
      pageId: 'p',
      accountName: 'a',
      locationName: 'l',
      code: 'descartado',
      __proto__: { admin: true },
      nested: { evil: true },
    });
    expect({ ...result }).toEqual({
      state: 's',
      page: '123',
      id: 'acc/1',
      pageId: 'p',
      accountName: 'a',
      locationName: 'l',
    });
  });

  it('recusa objeto no lugar de texto e valor gigante', async () => {
    await expect(run({ page: { $gt: '' } })).rejects.toBeDefined();
    await expect(run({ id: 'x'.repeat(600) })).rejects.toBeDefined();
  });

  it('ids so com caracteres seguros para a URL do provider (caminho do GMB passa)', async () => {
    await expect(
      run({ id: 'accounts/1/locations/2', locationName: 'locations/2', accountName: 'accounts/1' })
    ).resolves.toBeDefined();
    for (const bad of ['123?fields=access_token', '../me', 'a b', '1#x', 'p&x=1']) {
      await expect(run({ page: bad })).rejects.toBeDefined();
    }
    await expect(run({ state: 'abc DEF' })).rejects.toBeDefined();
  });

  // payload exato de cada picker do frontend (continue-provider) + state do
  // makeSecureId e os parametros extras da URL do callback
  it.each([
    ['facebook', { page: '102938475610293' }],
    ['linkedin-page', { page: 87654321 }],
    ['youtube', { id: 'UC_x5XG1OV2P6uZZ5FSM9Ttw' }],
    ['instagram', { id: '17841400000000000', pageId: '102938475610293' }],
    ['gmb', { id: 'accounts/123/locations/456', accountName: 'accounts/123', locationName: 'locations/456' }],
  ])('aceita o payload do picker do %s', async (_provider, payload) => {
    const result = await run({ ...payload, state: 'aB3dE9', code: 'x', scope: 'y' });
    expect(result.state).toBe('aB3dE9');
    expect((result as any).code).toBeUndefined();
  });

  it('pagina nao aceita caminho (iria para outra rota da API)', async () => {
    await expect(run({ page: 'me/accounts' })).rejects.toBeDefined();
    await expect(run({ pageId: '1/x' })).rejects.toBeDefined();
  });
});
