import {
  AuthProvider,
  AuthProviderAbstract,
} from '@gitroom/backend/services/auth/providers.interface';
import { FarcasterSignerService } from '@gitroom/nestjs-libraries/integrations/social/farcaster.signer.service';

// Login com Farcaster: o "code" e o requestId opaco do managed signer aprovado
// no modal do QR (registro em farcaster.signer.registry; o signer_uuid nunca
// sai do servidor). O AuthController confere o vinculo (cookie httpOnly) antes
// de chegar aqui e consome o code depois do login/cadastro; toda consulta a
// Neynar passa pelo provider social (host fixo, sem @neynar/nodejs-sdk).
@AuthProvider({ provider: 'FARCASTER' })
export class FarcasterProvider extends AuthProviderAbstract {
  constructor(private _farcasterSignerService: FarcasterSignerService) {
    super();
  }

  // sem redirect OAuth: o modal do QR fala com /auth/farcaster/signer. O
  // upstream devolve aqui o nonce do cookie oauth_state, que o fork nao tem;
  // o vinculo ao navegador e o cookie do proprio signer (farcaster_login).
  generateLink() {
    return '';
  }

  async getToken(code: string, _redirectUri?: string) {
    return this._farcasterSignerService.loginToken(code);
  }

  async getUser(providerToken: string) {
    // signer nao aprovado/desconhecido nao gera identidade (antes saia
    // { id: '' } e o registro seguia com providerId vazio)
    return this._farcasterSignerService.loginIdentity(providerToken);
  }
}
