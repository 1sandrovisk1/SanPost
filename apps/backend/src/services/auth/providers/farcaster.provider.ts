import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';
import {
  decodeFarcasterSignerUuid,
  FarcasterProvider as FarcasterSocialProvider,
  isFarcasterSignerUuid,
} from '@gitroom/nestjs-libraries/integrations/social/farcaster.provider';

// Login com Farcaster: o "code" e o mesmo do canal (JSON base64 com o
// signer_uuid do managed signer aprovado no modal do QR). Toda consulta a
// Neynar passa pelo provider social (this.fetch, host fixo) — o
// @neynar/nodejs-sdk nao e mais usado aqui.
@AuthProvider({ provider: 'FARCASTER' })
export class FarcasterProvider extends AuthProviderAbstract {
  private readonly _farcaster = new FarcasterSocialProvider();

  // sem redirect OAuth: o modal do QR fala direto com /auth/farcaster/signer.
  // O upstream devolve aqui o nonce do cookie oauth_state, que o fork nao tem
  // (divergencia registrada na triagem de out/2026).
  generateLink() {
    return '';
  }

  async getToken(code: string, _redirectUri?: string) {
    const signerUuid = decodeFarcasterSignerUuid(code);
    if (!signerUuid) {
      return '';
    }

    const signer = await this._farcaster.lookupSigner(signerUuid);
    return signer.status === 'approved' ? signerUuid : '';
  }

  async getUser(providerToken: string) {
    if (!isFarcasterSignerUuid(providerToken)) {
      return false as const;
    }

    const signer = await this._farcaster.lookupSigner(providerToken);
    // Antes devolvia { id: '', email: '' } para signer nao aprovado, e o
    // registro/login seguia com providerId vazio. Sem signer aprovado nao ha
    // identidade.
    if (signer.status !== 'approved' || !signer.fid) {
      return false as const;
    }

    return {
      id: String('farcaster_' + signer.fid),
      email: String('farcaster_' + signer.fid),
    };
  }
}
