import 'reflect-metadata';

jest.mock('@gitroom/helpers/auth/auth.service', () => ({
  AuthService: {
    fixedDecryption: jest.fn(() =>
      JSON.stringify({
        url: 'https://listmonk.exemplo.com',
        username: 'api',
        password: 'segredo',
      })
    ),
  },
}));

import { ListmonkProvider } from './listmonk.provider';

// imagem inline no corpo do e-mail (upstream 2aae02fe + 28701a98)
describe('ListmonkProvider imagem inline', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('declara inlineImages e a regra para o agente com as tools do fork', () => {
    const provider = new ListmonkProvider();
    expect(provider.inlineImages()).toBe(true);
    const rules = Reflect.getMetadata(
      'custom:rules:description',
      ListmonkProvider
    );
    expect(rules).toContain('<img src="...">');
    expect(rules).toContain('mediaListTool');
    expect(rules).not.toContain('uploadFromUrlTool');
  });

  it('envia a imagem dentro do conteudo, limitada a largura do e-mail', async () => {
    const provider = new ListmonkProvider();
    const fetch = jest
      .spyOn(provider, 'fetch')
      .mockResolvedValueOnce({
        json: async () => ({ data: { uuid: 'uuid-1', id: 7 } }),
      } as any)
      .mockResolvedValueOnce({ json: async () => ({}) } as any);
    const message =
      '<p>Oi</p><img src="https://app.exemplo.com/uploads/a.png" alt="capa">';

    const [result] = await provider.post(
      'lista',
      'token',
      [
        {
          id: 'post-1',
          message,
          settings: { subject: 'Novidades', list: '3', preview: '' },
        },
      ] as any,
      { customInstanceDetails: 'cifrado' } as any
    );

    const payload = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(payload.content_type).toBe('html');
    expect(payload.body).toContain(message);
    expect(payload.body).toMatch(/\.content img \{\s*max-width: 100%;/);
    expect(result.status).toBe('completed');
  });
});
