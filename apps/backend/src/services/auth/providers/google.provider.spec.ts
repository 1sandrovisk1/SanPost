import { HttpException } from '@nestjs/common';

const getToken = jest.fn();
jest.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: jest.fn(() => ({ getToken })) },
  },
}));

import { GoogleProvider } from './google.provider';

describe('GoogleProvider.getToken', () => {
  beforeEach(() => {
    getToken.mockReset();
  });

  it('devolve o access token quando o code e valido', async () => {
    getToken.mockResolvedValue({ tokens: { access_token: 'tok' } });

    await expect(new GoogleProvider().getToken('code')).resolves.toBe('tok');
  });

  it('code expirado ou reutilizado (invalid_grant) vira 400 com mensagem clara', async () => {
    getToken.mockRejectedValue(
      Object.assign(new Error('invalid_grant'), {
        response: { data: { error: 'invalid_grant' } },
      })
    );

    const err = await new GoogleProvider().getToken('code').catch((e) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(err.getStatus()).toBe(400);
    expect(err.message).toBe('Google sign-in expired, please sign in again');
  });

  it('outros erros sobem sem alteracao', async () => {
    const boom = new Error('network down');
    getToken.mockRejectedValue(boom);

    await expect(new GoogleProvider().getToken('code')).rejects.toBe(boom);
  });
});
