import { HttpException, Injectable, Logger } from '@nestjs/common';
import { IntegrationManager } from '@gitroom/nestjs-libraries/integrations/integration.manager';
import {
  FarcasterNeynarError,
  FarcasterNeynarFailure,
  FarcasterProvider,
  FarcasterSignerStatus,
} from '@gitroom/nestjs-libraries/integrations/social/farcaster.provider';
import {
  farcasterNonceMatches,
  farcasterSignerRegistry,
  hashFarcasterNonce,
} from '@gitroom/nestjs-libraries/integrations/social/farcaster.signer.registry';
import { summarizeError } from '@gitroom/nestjs-libraries/services/error.summary';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import { ioRedis } from '@gitroom/nestjs-libraries/redis/redis.service';

export const FARCASTER_LOGIN_COOKIE = 'farcaster_login';

// Codigos estaveis que o modal do QR traduz (useT); a mensagem crua da Neynar
// nunca vai ao navegador. "failed" e o unico transitorio (o modal segue
// consultando); os demais param o polling.
export type FarcasterSignerFailure = {
  error:
    | FarcasterNeynarFailure
    | 'not_configured'
    | 'invalid_state';
};

// O navegador recebe um requestId opaco, nunca o signer_uuid.
export type FarcasterSignerStart = {
  requestId: string;
  approvalUrl: string;
  qrCode: string;
};

export type FarcasterSignerStatusResult = { status: FarcasterSignerStatus };

export type FarcasterChannelContext = {
  orgId: string;
  userId: string;
  profileId: string | null;
};

const invalidLoginCode = () =>
  new HttpException(
    {
      code: 'farcaster_invalid_code',
      message: 'Invalid or expired Farcaster login, please try again',
    },
    400
  );

const STATE = /^[A-Za-z0-9]{8,64}$/;

// Fluxo de aprovacao do managed signer (upstream #2078/#2080) compartilhado
// pelo login com Farcaster (rotas publicas em /auth) e pela conexao de canal
// (rotas autenticadas em /integrations). Cada signer emitido fica no registro
// (farcaster.signer.registry) com o vinculo de quem o criou.
@Injectable()
export class FarcasterSignerService {
  private readonly _logger = new Logger('FarcasterSignerService');

  constructor(private _integrationManager: IntegrationManager) {}

  private provider(): FarcasterProvider {
    return this._integrationManager.getSocialIntegration(
      'wrapcast'
    ) as FarcasterProvider;
  }

  isLoginEnabled(): boolean {
    return this.provider().isLoginEnabled();
  }

  // gate unico das rotas publicas do login (criacao, status e troca do code)
  assertLoginEnabled() {
    if (!this.isLoginEnabled()) {
      throw new HttpException('Farcaster login is disabled', 404);
    }
  }

  private async create(
    sponsor: boolean
  ): Promise<
    | { signerUuid: string; approvalUrl: string; qrCode: string }
    | FarcasterSignerFailure
  > {
    const provider = this.provider();
    if (!provider.isConfigured()) {
      return { error: 'not_configured' };
    }

    try {
      return await provider.createSigner({ sponsor });
    } catch (err) {
      this._logger.error(
        `criação do signer do Farcaster falhou: ${summarizeError(err)}`
      );
      return { error: 'failed' };
    }
  }

  private async statusOf(
    signerUuid: string
  ): Promise<FarcasterSignerStatusResult | FarcasterSignerFailure> {
    try {
      const { status } = await this.provider().lookupSigner(signerUuid);
      return { status };
    } catch (err) {
      const reason =
        err instanceof FarcasterNeynarError ? err.reason : 'failed';
      if (reason === 'failed') {
        this._logger.warn(
          `consulta do signer do Farcaster falhou: ${summarizeError(err)}`
        );
      }
      return { error: reason };
    }
  }

  // ---- login (rotas publicas) ----

  // Login nunca e patrocinado: a rota e publica e cada clique cria um signer.
  async startLogin(): Promise<{
    body: FarcasterSignerStart | FarcasterSignerFailure;
    nonce?: string;
  }> {
    this.assertLoginEnabled();
    const created = await this.create(false);
    if ('error' in created) {
      return { body: created };
    }

    const nonce = makeSecureId(32);
    const requestId = await farcasterSignerRegistry.issue({
      purpose: 'login',
      signerUuid: created.signerUuid,
      nonceHash: hashFarcasterNonce(nonce),
    });

    return {
      body: {
        requestId,
        approvalUrl: created.approvalUrl,
        qrCode: created.qrCode,
      },
      nonce,
    };
  }

  async loginStatus(
    requestId: unknown,
    nonce: unknown
  ): Promise<FarcasterSignerStatusResult | FarcasterSignerFailure> {
    this.assertLoginEnabled();
    const entry = await farcasterSignerRegistry.get(requestId);
    if (
      !entry ||
      entry.purpose !== 'login' ||
      !farcasterNonceMatches(nonce, entry.nonceHash)
    ) {
      return { error: 'invalid_signer' };
    }

    return this.statusOf(entry.signerUuid);
  }

  // Troca do code (exists/login/register com provider FARCASTER): gate +
  // registro + cookie do mesmo navegador, antes de qualquer chamada a Neynar.
  async assertLoginCode(code: unknown, nonce: unknown): Promise<void> {
    this.assertLoginEnabled();
    const entry = await farcasterSignerRegistry.get(code);
    if (
      !entry ||
      entry.purpose !== 'login' ||
      !farcasterNonceMatches(nonce, entry.nonceHash)
    ) {
      throw invalidLoginCode();
    }
  }

  // Reserva compartilhada entre exists/login/register ANTES de criar conta,
  // aceitar convite ou emitir sessao. Falha fecha o code ate novo fluxo.
  async claimLoginCode(code: string, nonce: unknown): Promise<void> {
    await this.assertLoginCode(code, nonce);
    if (!await farcasterSignerRegistry.claimLogin(code)) throw invalidLoginCode();
  }

  async releaseLoginClaim(code: string): Promise<void> {
    await farcasterSignerRegistry.releaseLoginClaim(code);
  }

  // AuthProvider.getToken: o token do login e o proprio requestId (o
  // signer_uuid nao sai do servidor)
  async loginToken(code: string): Promise<string> {
    const entry = await farcasterSignerRegistry.get(code);
    if (!entry || entry.purpose !== 'login') {
      throw invalidLoginCode();
    }

    const result = await this.statusOf(entry.signerUuid);
    if ('error' in result || result.status !== 'approved') {
      throw invalidLoginCode();
    }

    return code;
  }

  // AuthProvider.getUser: identidade pelo fid do signer aprovado
  async loginIdentity(
    token: string
  ): Promise<{ id: string; email: string } | false> {
    const entry = await farcasterSignerRegistry.get(token);
    if (!entry || entry.purpose !== 'login') {
      return false;
    }

    try {
      const signer = await this.provider().lookupSigner(entry.signerUuid);
      if (signer.status !== 'approved' || !signer.fid) {
        return false;
      }
      return {
        id: String('farcaster_' + signer.fid),
        email: String('farcaster_' + signer.fid),
      };
    } catch (err) {
      if (err instanceof FarcasterNeynarError) {
        return false;
      }
      throw err;
    }
  }

  // Uso unico depois de o login/cadastro concluir. A Neynar nao revoga managed
  // signers pela API (a remocao e on-chain, pela conta do usuario): o signer do
  // login continua aprovado ate o usuario revogar no app, mas a instancia nao o
  // guarda nem aceita o requestId de novo.
  async consumeLogin(code: unknown): Promise<void> {
    if (!await farcasterSignerRegistry.consume(code)) throw invalidLoginCode();
  }

  // ---- canal (rotas autenticadas) ----

  // O state vem do /integrations/social/wrapcast do proprio usuario: precisa
  // apontar para a mesma org/perfil de quem chama.
  async startChannel(
    state: unknown,
    context: FarcasterChannelContext
  ): Promise<FarcasterSignerStart | FarcasterSignerFailure> {
    if (typeof state !== 'string' || !STATE.test(state)) {
      return { error: 'invalid_state' };
    }
    const [stateOrg, stateProfile] = await Promise.all([
      ioRedis.get(`organization:${state}`),
      ioRedis.get(`profile:${state}`),
    ]);
    if (
      !stateOrg ||
      stateOrg !== context.orgId ||
      (stateProfile || null) !== (context.profileId || null)
    ) {
      return { error: 'invalid_state' };
    }

    const created = await this.create(
      process.env.NEYNAR_SPONSOR_SIGNERS === 'true'
    );
    if ('error' in created) {
      return created;
    }

    const requestId = await farcasterSignerRegistry.issue({
      purpose: 'channel',
      signerUuid: created.signerUuid,
      orgId: context.orgId,
      userId: context.userId,
      profileId: context.profileId || null,
      state,
    });

    return {
      requestId,
      approvalUrl: created.approvalUrl,
      qrCode: created.qrCode,
    };
  }

  async channelStatus(
    requestId: unknown,
    context: { orgId: string; userId: string }
  ): Promise<FarcasterSignerStatusResult | FarcasterSignerFailure> {
    const entry = await farcasterSignerRegistry.get(requestId);
    if (
      !entry ||
      entry.purpose !== 'channel' ||
      entry.orgId !== context.orgId ||
      entry.userId !== context.userId
    ) {
      return { error: 'invalid_signer' };
    }

    return this.statusOf(entry.signerUuid);
  }
}
