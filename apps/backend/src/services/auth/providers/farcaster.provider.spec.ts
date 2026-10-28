jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class {},
}));

import 'reflect-metadata';
import { HttpException } from '@nestjs/common';
import { FarcasterProvider } from './farcaster.provider';

const REQUEST_ID = 'A'.repeat(32);

// O login delega ao FarcasterSignerService: o code e o requestId opaco do
// registro (vinculo e uso unico ficam no AuthController/service).
describe('FarcasterProvider (login)', () => {
  const setup = () => {
    const signers = {
      loginToken: jest.fn(),
      loginIdentity: jest.fn(),
    };
    return { signers, provider: new FarcasterProvider(signers as any) };
  };

  it('getToken devolve o token do service (o proprio requestId)', async () => {
    const { signers, provider } = setup();
    signers.loginToken.mockResolvedValue(REQUEST_ID);

    await expect(provider.getToken(REQUEST_ID)).resolves.toBe(REQUEST_ID);
    expect(signers.loginToken).toHaveBeenCalledWith(REQUEST_ID);
  });

  it('getToken propaga o 400 estavel de code invalido (nunca 500)', async () => {
    const { signers, provider } = setup();
    signers.loginToken.mockRejectedValue(new HttpException('x', 400));

    const error = await provider.getToken('lixo').catch((e) => e);
    expect(error.getStatus()).toBe(400);
  });

  it('getUser devolve a identidade pelo fid ou false', async () => {
    const { signers, provider } = setup();
    signers.loginIdentity
      .mockResolvedValueOnce({ id: 'farcaster_777', email: 'farcaster_777' })
      .mockResolvedValueOnce(false);

    await expect(provider.getUser(REQUEST_ID)).resolves.toEqual({
      id: 'farcaster_777',
      email: 'farcaster_777',
    });
    // signer nao aprovado nao gera identidade (antes saia id vazio)
    await expect(provider.getUser(REQUEST_ID)).resolves.toBe(false);
  });

  it('generateLink continua vazio (o fork nao tem o cookie oauth_state)', () => {
    expect(setup().provider.generateLink()).toBe('');
  });
});
