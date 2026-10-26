import 'reflect-metadata';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'nostr-spec-secret';

jest.mock('nostr-tools', () => ({
  getPublicKey: jest.fn().mockReturnValue('pubkey'),
  Relay: jest.fn(),
  finalizeEvent: jest.fn().mockImplementation((event: any) => ({ ...event, id: 'evt-1' })),
  SimplePool: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('ws', () => {
  const WebSocketMock = jest.fn();
  return { __esModule: true, default: WebSocketMock, WebSocket: WebSocketMock };
});

import { finalizeEvent } from 'nostr-tools';
import { NostrProvider } from './nostr.provider';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';

const HEX_KEY = '0a0bff'.repeat(10) + '0a0b';

// Lote de providers out/2026 — porte do PR upstream #2141: finalizeEvent
// recebia a senha em hex como string; precisa da chave secreta em bytes.
describe('NostrProvider.secretKey', () => {
  it('converte a chave hex (64 caracteres) em Uint8Array', () => {
    const key = (new NostrProvider() as any).secretKey(HEX_KEY);
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.length).toBe(32);
    expect(Array.from(key).slice(0, 3)).toEqual([10, 11, 255]);
  });

  it('rejeita chave que nao e hex de 64 (ex.: nsec1...) com BadBody', () => {
    expect(() => (new NostrProvider() as any).secretKey('nsec1' + 'x'.repeat(58))).toThrow(BadBody);
    expect(() => (new NostrProvider() as any).secretKey('0a0bff')).toThrow(BadBody);
  });

  it('authenticate com chave invalida devolve Invalid credentials', async () => {
    const code = Buffer.from(JSON.stringify({ password: 'nsec1' + 'x'.repeat(58) })).toString('base64');
    await expect(new NostrProvider().authenticate({ code } as any)).resolves.toBe('Invalid credentials');
  });
});

describe('NostrProvider.post / comment assinam com a chave em bytes', () => {
  const accessToken = AuthService.signJWT({ password: HEX_KEY });

  it('post', async () => {
    const provider = new NostrProvider();
    jest.spyOn(provider as any, 'publish').mockResolvedValue('evt-1');

    await provider.post('pub', accessToken, [{ id: 'p1', message: 'hello', media: [] }] as any);
    const secret = (finalizeEvent as jest.Mock).mock.calls[0][1];
    expect(secret).toBeInstanceOf(Uint8Array);
    expect(secret.length).toBe(32);
  });

  it('comment', async () => {
    const provider = new NostrProvider();
    jest.spyOn(provider as any, 'publish').mockResolvedValue('evt-2');
    (finalizeEvent as jest.Mock).mockClear();

    await provider.comment('pub', 'evt-1', undefined, accessToken, [{ id: 'c1', message: 'reply', media: [] }] as any, {} as any);
    const secret = (finalizeEvent as jest.Mock).mock.calls[0][1];
    expect(secret).toBeInstanceOf(Uint8Array);
  });
});
