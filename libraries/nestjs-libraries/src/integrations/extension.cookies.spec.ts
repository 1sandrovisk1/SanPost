import { AuthService } from '@gitroom/helpers/auth/auth.service';
import {
  encryptExtensionCookiesForStorage,
  pickExtensionCookies,
} from './extension.cookies';

describe('extension.cookies', () => {
  const ORIGINAL = process.env.JWT_SECRET;
  const provider = {
    extensionCookies: [
      { name: 'client_id', domain: '.skool.com' },
      { name: 'auth_token', domain: '.skool.com' },
    ],
  };
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64');

  beforeAll(() => {
    process.env.JWT_SECRET = 'segredo-de-teste';
  });

  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL;
  });

  it('mantem apenas os cookies declarados pelo provider', () => {
    const picked = pickExtensionCookies(
      provider,
      encode({
        client_id: 'cid',
        auth_token: 'tok',
        id: 'usuario-vitima',
        saasName: 'forjado',
        billing: 'ULTIMATE',
      })
    );

    expect(picked).toEqual({ client_id: 'cid', auth_token: 'tok' });
  });

  it('ignora valores que nao sao string e payloads que nao sao objeto', () => {
    expect(
      pickExtensionCookies(provider, encode({ client_id: 1, auth_token: ['x'] }))
    ).toEqual({});
    expect(pickExtensionCookies(provider, encode(['a']))).toEqual({});
    expect(pickExtensionCookies(provider, encode('x'))).toEqual({});
    expect(pickExtensionCookies({}, encode({ client_id: 'cid' }))).toEqual({});
  });

  it('grava no formato AES que o provider le primeiro (nao e um JWT)', () => {
    const stored = encryptExtensionCookiesForStorage(
      provider,
      encode({ client_id: 'cid', auth_token: 'tok', extra: 'fora' })
    );

    expect(JSON.parse(AuthService.fixedDecryption(stored))).toEqual({
      client_id: 'cid',
      auth_token: 'tok',
    });
    expect(() => AuthService.verifyJWT(stored)).toThrow();
  });

  it('o leitor legado em JWT continua decodificavel (contas antigas)', () => {
    const legacy = AuthService.signJWT({ client_id: 'cid', auth_token: 'tok' });

    expect(() => JSON.parse(AuthService.fixedDecryption(legacy))).toThrow();
    expect(AuthService.verifyJWT(legacy)).toMatchObject({
      client_id: 'cid',
      auth_token: 'tok',
    });
  });
});
