import { Injectable, Logger } from '@nestjs/common';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  FarcasterProvider,
  FarcasterSignerRequest,
  FarcasterSignerState,
  isFarcasterSignerUuid,
} from '@gitroom/nestjs-libraries/integrations/social/farcaster.provider';
import { summarizeError } from '@gitroom/nestjs-libraries/services/error.summary';

// Codigos estaveis que o modal do QR traduz (useT); a mensagem crua da Neynar
// nunca vai ao navegador.
export type FarcasterSignerFailure = {
  error: 'not_configured' | 'failed' | 'invalid_signer';
};

// Fluxo de aprovacao do managed signer (upstream #2078/#2080) compartilhado
// pelo login com Farcaster (rotas publicas em /auth) e pela conexao de canal
// (rotas autenticadas em /integrations).
@Injectable()
export class FarcasterSignerService {
  private readonly _logger = new Logger('FarcasterSignerService');

  constructor(private _integrationManager: IntegrationManager) {}

  private provider(): FarcasterProvider {
    return this._integrationManager.getSocialIntegration(
      'wrapcast'
    ) as FarcasterProvider;
  }

  // O login com Farcaster segue o gate do botao no frontend (NEYNAR_CLIENT_ID,
  // como no upstream) e exige a Neynar configurada; sem isso as rotas publicas
  // nao criam signer nenhum.
  isLoginEnabled(): boolean {
    return !!process.env.NEYNAR_CLIENT_ID && this.provider().isConfigured();
  }

  async start(): Promise<FarcasterSignerRequest | FarcasterSignerFailure> {
    const provider = this.provider();
    if (!provider.isConfigured()) {
      return { error: 'not_configured' };
    }

    try {
      return await provider.createSigner();
    } catch (err) {
      this._logger.error(
        `criação do signer do Farcaster falhou: ${summarizeError(err)}`
      );
      return { error: 'failed' };
    }
  }

  async status(
    signerUuid: unknown
  ): Promise<FarcasterSignerState | FarcasterSignerFailure> {
    if (!isFarcasterSignerUuid(signerUuid)) {
      return { error: 'invalid_signer' };
    }

    const provider = this.provider();
    if (!provider.isConfigured()) {
      return { error: 'not_configured' };
    }

    try {
      return await provider.signerStatus(signerUuid);
    } catch (err) {
      // o modal segue consultando ate aprovar ou expirar
      this._logger.warn(
        `consulta do signer do Farcaster falhou: ${summarizeError(err)}`
      );
      return { error: 'failed' };
    }
  }
}
