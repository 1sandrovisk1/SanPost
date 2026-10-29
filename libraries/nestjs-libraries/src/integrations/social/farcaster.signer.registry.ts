import { createHash, timingSafeEqual } from 'crypto';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';

// Registro server-side dos managed signers emitidos pela instancia. O navegador
// so recebe um requestId opaco (nunca o signer_uuid); o requestId so vale com o
// mesmo vinculo de quem o criou (cookie do login ou org/usuario/state do canal)
// e e de uso unico (apagado ao concluir o login/conexao).
// 10 min de polling no modal + folga para concluir o login/cadastro.
export const FARCASTER_SIGNER_TTL_SECONDS = 15 * 60;

const REQUEST_ID = /^[A-Za-z0-9]{32}$/;
const SIGNER_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const registryKey = (requestId: string) => `farcaster:signer:${requestId}`;

export type FarcasterLoginBinding = {
  purpose: 'login';
  // sha256 do nonce que vai no cookie httpOnly; o nonce cru nunca e guardado
  nonceHash: string;
};

export type FarcasterChannelBinding = {
  purpose: 'channel';
  orgId: string;
  userId: string;
  profileId: string | null;
  // state do /integrations/social/wrapcast (org/perfil no Redis)
  state: string;
};

export type FarcasterSignerEntry = (
  | FarcasterLoginBinding
  | FarcasterChannelBinding
) & { signerUuid: string };

export const isFarcasterRequestId = (value: unknown): value is string =>
  typeof value === 'string' && REQUEST_ID.test(value);

export const hashFarcasterNonce = (nonce: string) =>
  createHash('sha256').update(nonce).digest('hex');

export const farcasterNonceMatches = (
  nonce: unknown,
  nonceHash: string
): boolean => {
  if (typeof nonce !== 'string' || !nonce || typeof nonceHash !== 'string') {
    return false;
  }
  const expected = Buffer.from(nonceHash, 'hex');
  const received = Buffer.from(hashFarcasterNonce(nonce), 'hex');
  return (
    expected.length === received.length && timingSafeEqual(expected, received)
  );
};

export const farcasterSignerRegistry = {
  async issue(entry: FarcasterSignerEntry): Promise<string> {
    const requestId = makeSecureId(32);
    await ioRedis.set(
      registryKey(requestId),
      JSON.stringify(entry),
      'EX',
      FARCASTER_SIGNER_TTL_SECONDS
    );
    return requestId;
  },

  // requestId fora do formato ou desconhecido devolve null sem tocar a Neynar
  async get(requestId: unknown): Promise<FarcasterSignerEntry | null> {
    if (!isFarcasterRequestId(requestId)) {
      return null;
    }
    const raw = await ioRedis.get(registryKey(requestId));
    if (!raw) {
      return null;
    }
    try {
      const entry = JSON.parse(raw) as FarcasterSignerEntry;
      if (
        !SIGNER_UUID.test(String(entry?.signerUuid)) ||
        (entry.purpose !== 'login' && entry.purpose !== 'channel')
      ) {
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  },

  async claimLogin(requestId: string): Promise<boolean> {
    return (await ioRedis.set(`farcaster:exchange:${requestId}`, '1', 'EX', FARCASTER_SIGNER_TTL_SECONDS, 'NX')) === 'OK';
  },

  async releaseLoginClaim(requestId: string): Promise<void> {
    await ioRedis.del(`farcaster:exchange:${requestId}`);
  },

  // uso unico: so quem apagar a chave (DEL = 1) conclui; sem GETDEL porque o
  // MockRedis do fallback nao tem
  async consume(requestId: unknown): Promise<boolean> {
    if (!isFarcasterRequestId(requestId)) {
      return false;
    }
    return (await ioRedis.del(registryKey(requestId))) === 1;
  },
};
