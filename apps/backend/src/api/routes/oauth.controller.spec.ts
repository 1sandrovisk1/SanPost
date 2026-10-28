import { HttpException } from '@nestjs/common';
import { OAuthAuthorizedController } from './oauth.controller';

// Aprovacao de app OAuth pelo papel de quem aprova.
describe('OAuthAuthorizedController.approveOrDeny', () => {
  const build = () => {
    const service = {
      validateAuthorizationRequest: jest
        .fn()
        .mockResolvedValue({ id: 'app-1', redirectUrl: 'https://app.example.com/cb' }),
      createAuthorizationCode: jest.fn().mockResolvedValue('codigo'),
    };
    return { controller: new OAuthAuthorizedController(service as any), service };
  };
  const org = (role: string) => ({ id: 'org-1', users: [{ role }] }) as any;
  const body = { client_id: 'pca_1', action: 'approve', state: 's' } as any;

  it('admin aprova para a org inteira (sem perfil no token)', async () => {
    const { controller, service } = build();

    const result = await controller.approveOrDeny(body, { id: 'user-1' } as any, org('ADMIN'), { id: 'prof-1' } as any);

    expect(service.createAuthorizationCode).toHaveBeenCalledWith('app-1', 'user-1', 'org-1', null);
    expect(result.redirect).toBe('https://app.example.com/cb?code=codigo&state=s');
  });

  it('membro USER aprova so para o perfil ativo dele', async () => {
    const { controller, service } = build();

    await controller.approveOrDeny(body, { id: 'user-1' } as any, org('USER'), { id: 'prof-1' } as any);

    expect(service.createAuthorizationCode).toHaveBeenCalledWith('app-1', 'user-1', 'org-1', 'prof-1');
  });

  it('membro USER sem perfil recebe 403 e nenhum codigo', async () => {
    const { controller, service } = build();

    const err = await controller
      .approveOrDeny(body, { id: 'user-1' } as any, org('USER'), null)
      .catch((e) => e);

    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(403);
    expect(service.createAuthorizationCode).not.toHaveBeenCalled();
  });
});
