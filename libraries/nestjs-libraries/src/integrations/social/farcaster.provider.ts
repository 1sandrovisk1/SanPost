import {
  AuthTokenDetails,
  PostDetails,
  PostResponse,
  SocialProvider,
} from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';
import dayjs from 'dayjs';
import {
  BadBody,
  SocialAbstract,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { Integration } from '@prisma/client';
import { FarcasterDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/farcaster.dto';
import { Tool } from '@gitroom/nestjs-libraries/integrations/tool.decorator';
import { Rules } from '@gitroom/nestjs-libraries/chat/rules.description.decorator';
import { summarizeError } from '@gitroom/nestjs-libraries/services/error.summary';
import { Logger } from '@nestjs/common';
import { mnemonicToAccount } from 'viem/accounts';
import { toDataURL } from 'qrcode';

// Host fixo da Neynar: todas as chamadas passam por this.fetch (ssrfSafeFetch),
// com a chave da API so no header — nada disso chega ao navegador. O caminho
// com barra final e o mesmo do @neynar/nodejs-sdk.
const NEYNAR_API = 'https://api.neynar.com/v2/farcaster';

// Contrato SignedKeyRequestValidator do Farcaster (Optimism). Mesmos valores do
// @neynar/nodejs-sdk (common/constants) e do upstream #2078 — nao alterar.
const SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN = {
  name: 'Farcaster SignedKeyRequestValidator',
  version: '1',
  chainId: 10,
  verifyingContract: '0x00000000fc700472606ed4fa22623acf62c60553',
} as const;

const SIGNED_KEY_REQUEST_TYPE = [
  { name: 'requestFid', type: 'uint256' },
  { name: 'key', type: 'bytes' },
  { name: 'deadline', type: 'uint256' },
] as const;

// prazo do pedido de aprovacao do signer (o SDK e o upstream usam 24 h)
const SIGNED_KEY_DEADLINE_SECONDS = 24 * 60 * 60;

const SIGNER_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SIGNER_STATUSES = [
  'generated',
  'pending_approval',
  'approved',
  'revoked',
] as const;

export type FarcasterSignerStatus = (typeof SIGNER_STATUSES)[number];

export type FarcasterSignerRequest = {
  signerUuid: string;
  approvalUrl: string;
  qrCode: string;
};

export type FarcasterSignerState = {
  status: FarcasterSignerStatus;
  code?: string;
};

type NeynarSigner = {
  signer_uuid?: string;
  public_key?: string;
  status?: string;
  fid?: number;
  signer_approval_url?: string;
};

type NeynarUser = {
  fid?: number;
  username?: string;
  display_name?: string;
  pfp_url?: string;
};

type FarcasterAccount = {
  fid: number;
  username: string;
  display_name: string;
  pfp_url: string;
};

// Mensagens curadas (viram o erro do post / o motivo do canal na tela Status).
export const FARCASTER_RECONNECT_MESSAGE =
  'A autorização do Farcaster deste canal foi revogada ou não vale mais para a chave da Neynar desta instância; reconecte o canal';
const NEYNAR_KEY_REFUSED_MESSAGE =
  'A Neynar recusou a chave da API desta instância (NEYNAR_SECRET_KEY); o administrador precisa revisá-la';
const NEYNAR_NO_CREDITS_MESSAGE =
  'A conta da Neynar desta instância está sem créditos; o administrador precisa renová-los';
const NEYNAR_RATE_LIMIT_MESSAGE =
  'A Neynar limitou as requisições desta instância; tente de novo em alguns minutos';

export class FarcasterNotConfiguredError extends Error {
  constructor() {
    super(
      'Farcaster não configurado: defina NEYNAR_SECRET_KEY, NEYNAR_APP_FID e NEYNAR_APP_MNEMONIC'
    );
    this.name = 'FarcasterNotConfiguredError';
  }
}

export const isFarcasterSignerUuid = (value: unknown): value is string =>
  typeof value === 'string' && SIGNER_UUID.test(value);

// O "code" do Farcaster (login e conexao de canal) e um JSON em base64 com o
// signer_uuid e os dados de exibicao, como no SIWN e no upstream. So o
// signer_uuid e aproveitado: fid/nome/foto sempre vem da Neynar, nunca do
// cliente.
export const decodeFarcasterSignerUuid = (code: string): string | null => {
  try {
    const data = JSON.parse(Buffer.from(String(code), 'base64').toString());
    return isFarcasterSignerUuid(data?.signer_uuid) ? data.signer_uuid : null;
  } catch {
    return null;
  }
};

const neynarMessage = (body: string): string => {
  try {
    const message = JSON.parse(body)?.message;
    return typeof message === 'string' ? message : '';
  } catch {
    return '';
  }
};

const appFid = (): number | undefined => {
  const fid = Number(process.env.NEYNAR_APP_FID);
  return Number.isSafeInteger(fid) && fid > 0 ? fid : undefined;
};

@Rules('Farcaster/Warpcast can only accept pictures')
export class FarcasterProvider
  extends SocialAbstract
  implements SocialProvider
{
  identifier = 'wrapcast';
  name = 'Farcaster';
  isBetweenSteps = false;
  isWeb3 = true;
  scopes = [] as string[];
  override maxConcurrentJob = 3; // Farcaster has moderate limits
  editor = 'normal' as const;
  maxLength() {
    return 800;
  }
  dto = FarcasterDto;

  private readonly _logger = new Logger('FarcasterProvider');

  // Credenciais da instancia (env), nao por workspace: o signer gerenciado fica
  // preso a chave da API da Neynar que o criou (o post usa a mesma chave) e o
  // mnemonic e a carteira de custodia da conta do app. Divergencia registrada
  // em src/integrations/social/CLAUDE.md.
  isConfigured(): boolean {
    return !!(
      process.env.NEYNAR_SECRET_KEY &&
      appFid() &&
      process.env.NEYNAR_APP_MNEMONIC
    );
  }

  override handleErrors(
    body: string,
    status: number
  ):
    | { type: 'refresh-token' | 'bad-body' | 'retry'; value: string }
    | undefined {
    const message = neynarMessage(body);

    // 401 = chave da API da instancia, nao o signer do canal: desconectar todos
    // os canais nao resolveria nada
    if (status === 401) {
      return { type: 'bad-body', value: NEYNAR_KEY_REFUSED_MESSAGE };
    }

    if (status === 402) {
      return { type: 'bad-body', value: NEYNAR_NO_CREDITS_MESSAGE };
    }

    // signer nao aprovado, revogado ou criado com outra chave da API (canais
    // conectados pelo SIWN numa chave antiga) — so reconectando
    if (
      /signer/i.test(message) ||
      (status === 403 && !/channel/i.test(message))
    ) {
      return { type: 'refresh-token', value: FARCASTER_RECONNECT_MESSAGE };
    }

    // continua sendo retentado pelo this.fetch; a mensagem so aparece quando as
    // retentativas acabam
    if (status === 429) {
      return { type: 'bad-body', value: NEYNAR_RATE_LIMIT_MESSAGE };
    }

    if (status >= 400 && status < 500) {
      return {
        type: 'bad-body',
        value: message
          ? `O Farcaster recusou a publicação: ${message.slice(0, 300)}`
          : 'O Farcaster recusou a publicação',
      };
    }

    // 5xx sem mapeamento: o this.fetch retenta
    return undefined;
  }

  private neynarHeaders(json = false): Record<string, string> {
    return {
      accept: 'application/json',
      'x-api-key': process.env.NEYNAR_SECRET_KEY || '',
      ...(json ? { 'Content-Type': 'application/json' } : {}),
    };
  }

  // Sem refresh nativo: o signer vale ate ser revogado no app do Farcaster. Um
  // RefreshToken do post (signer revogado) cai aqui e o canal e marcado para
  // reconexao com este motivo.
  async refreshToken(_refresh_token: string): Promise<AuthTokenDetails> {
    throw new Error(FARCASTER_RECONNECT_MESSAGE);
  }

  refreshErrorMessage(): string {
    return FARCASTER_RECONNECT_MESSAGE;
  }

  async generateAuthUrl() {
    const state = makeSecureId(17);
    return {
      url: `${process.env.NEYNAR_CLIENT_ID}||${state}` || '',
      codeVerifier: makeSecureId(10),
      state,
    };
  }

  // Managed signer (upstream #2078): cria o signer na Neynar, assina o
  // SignedKeyRequest com a carteira de custodia da conta do app e devolve a URL
  // de aprovacao (QR) que o usuario abre no app do Farcaster.
  async createSigner(): Promise<FarcasterSignerRequest> {
    const fid = appFid();
    const mnemonic = process.env.NEYNAR_APP_MNEMONIC;
    if (!process.env.NEYNAR_SECRET_KEY || !fid || !mnemonic) {
      throw new FarcasterNotConfiguredError();
    }

    const signer: NeynarSigner = await (
      await this.fetch(
        `${NEYNAR_API}/signer/`,
        { method: 'POST', headers: this.neynarHeaders() },
        'farcaster-create-signer'
      )
    ).json();

    if (
      !isFarcasterSignerUuid(signer?.signer_uuid) ||
      !/^0x[0-9a-f]+$/i.test(signer?.public_key || '')
    ) {
      throw new Error('Resposta inesperada da Neynar ao criar o signer');
    }

    const deadline = Math.floor(Date.now() / 1000) + SIGNED_KEY_DEADLINE_SECONDS;
    let signature: string;
    try {
      signature = await mnemonicToAccount(mnemonic).signTypedData({
        domain: SIGNED_KEY_REQUEST_VALIDATOR_EIP_712_DOMAIN,
        types: { SignedKeyRequest: SIGNED_KEY_REQUEST_TYPE },
        primaryType: 'SignedKeyRequest',
        message: {
          requestFid: BigInt(fid),
          key: signer.public_key as `0x${string}`,
          deadline: BigInt(deadline),
        },
      });
    } catch {
      // sem a causa: o erro da derivacao pode carregar trechos do mnemonic
      throw new Error(
        'Não foi possível assinar o pedido do signer com NEYNAR_APP_MNEMONIC'
      );
    }

    const registered: NeynarSigner = await (
      await this.fetch(
        `${NEYNAR_API}/signer/signed_key/`,
        {
          method: 'POST',
          headers: this.neynarHeaders(true),
          body: JSON.stringify({
            signer_uuid: signer.signer_uuid,
            app_fid: fid,
            deadline,
            signature,
            ...(process.env.NEYNAR_SPONSOR_SIGNERS === 'true'
              ? { sponsor: { sponsored_by_neynar: true } }
              : {}),
          }),
        },
        'farcaster-register-signer'
      )
    ).json();

    const approvalUrl = this.approvalUrl(registered?.signer_approval_url);

    return {
      signerUuid: signer.signer_uuid!,
      approvalUrl,
      qrCode: await toDataURL(approvalUrl),
    };
  }

  // a URL vai para o navegador (QR e "copiar link"): so https
  private approvalUrl(value: unknown): string {
    try {
      const url = new URL(String(value));
      if (url.protocol === 'https:') {
        return url.toString();
      }
    } catch {
      // cai no erro abaixo
    }
    throw new Error('A Neynar não devolveu uma URL de aprovação válida');
  }

  async lookupSigner(signerUuid: string): Promise<{
    status: FarcasterSignerStatus;
    fid?: number;
  }> {
    if (!isFarcasterSignerUuid(signerUuid)) {
      throw new Error('signer_uuid inválido');
    }

    const signer: NeynarSigner = await (
      await this.fetch(
        `${NEYNAR_API}/signer/?signer_uuid=${encodeURIComponent(signerUuid)}`,
        { headers: this.neynarHeaders() },
        'farcaster-lookup-signer'
      )
    ).json();

    const status = (SIGNER_STATUSES as readonly string[]).includes(
      String(signer?.status)
    )
      ? (signer.status as FarcasterSignerStatus)
      : 'pending_approval';
    const fid = Number(signer?.fid);

    return {
      status,
      ...(Number.isSafeInteger(fid) && fid > 0 ? { fid } : {}),
    };
  }

  private async account(fid: number): Promise<FarcasterAccount> {
    const { users = [] }: { users?: NeynarUser[] } = await (
      await this.fetch(
        `${NEYNAR_API}/user/bulk/?fids=${fid}`,
        { headers: this.neynarHeaders() },
        'farcaster-fetch-user'
      )
    ).json();
    const user = users.find((u) => Number(u?.fid) === fid) || users[0];

    return {
      fid,
      username: user?.username || '',
      display_name: user?.display_name || '',
      pfp_url: user?.pfp_url || '',
    };
  }

  // signer aprovado + perfil do dono, ambos lidos da Neynar
  async approvedAccount(signerUuid: string): Promise<FarcasterAccount | null> {
    const signer = await this.lookupSigner(signerUuid);
    if (signer.status !== 'approved' || !signer.fid) {
      return null;
    }

    return this.account(signer.fid);
  }

  async signerStatus(signerUuid: string): Promise<FarcasterSignerState> {
    const signer = await this.lookupSigner(signerUuid);
    if (signer.status !== 'approved') {
      return { status: signer.status };
    }

    if (!signer.fid) {
      return { status: 'pending_approval' };
    }

    const account = await this.account(signer.fid);

    return {
      status: 'approved',
      code: Buffer.from(
        JSON.stringify({ signer_uuid: signerUuid, ...account })
      ).toString('base64'),
    };
  }

  async authenticate(params: {
    code: string;
    codeVerifier: string;
    refresh?: string;
  }) {
    // o code vem do navegador: so o signer_uuid e usado, e o fid/perfil saem
    // da Neynar (antes o provider confiava no fid/nome enviados pelo cliente)
    const signerUuid = decodeFarcasterSignerUuid(params.code);
    if (!signerUuid) {
      throw new Error('Código de conexão do Farcaster inválido');
    }

    const account = await this.approvedAccount(signerUuid);
    if (!account) {
      throw new Error('A aprovação do Farcaster ainda não foi concluída');
    }

    return {
      id: String(account.fid),
      name: account.display_name || account.username,
      accessToken: signerUuid,
      refreshToken: '',
      expiresIn: dayjs().add(200, 'year').unix() - dayjs().unix(),
      picture: account.pfp_url || '',
      username: account.username,
    };
  }

  private async publishCast(
    signerUuid: string,
    body: Record<string, unknown>,
    integration?: Integration
  ): Promise<{ postId: string; releaseURL: string }> {
    const data = await (
      await this.fetch(
        `${NEYNAR_API}/cast/`,
        {
          method: 'POST',
          headers: this.neynarHeaders(true),
          body: JSON.stringify({ signer_uuid: signerUuid, ...body }),
        },
        'farcaster-publish-cast'
      )
    ).json();

    const hash: string | undefined = data?.cast?.hash;
    if (!hash) {
      throw new BadBody(
        this.identifier,
        JSON.stringify({ success: data?.success ?? null }),
        '{}',
        'O Farcaster não confirmou a publicação (resposta sem o hash do cast)'
      );
    }

    // a resposta do /cast so garante author.fid; o username salvo no canal
    // (integration.profile) cobre a URL
    const username = data?.cast?.author?.username || integration?.profile;

    return {
      postId: hash,
      releaseURL: username
        ? `https://warpcast.com/${username}/${hash}`
        : `https://warpcast.com/~/conversations/${hash}`,
    };
  }

  async post(
    id: string,
    accessToken: string,
    postDetails: PostDetails<FarcasterDto>[],
    integration?: Integration
  ): Promise<PostResponse[]> {
    const [firstPost] = postDetails;
    const ids: { releaseURL: string; postId: string }[] = [];

    const channels =
      !firstPost?.settings?.subreddit ||
      firstPost?.settings?.subreddit.length === 0
        ? [undefined]
        : firstPost?.settings?.subreddit;

    for (const channel of channels) {
      ids.push(
        await this.publishCast(
          accessToken,
          {
            text: firstPost.message,
            embeds: (firstPost?.media || []).map((media) => ({
              url: media.path,
            })),
            ...(channel?.value?.id ? { channel_id: channel.value.id } : {}),
          },
          integration
        )
      );
    }

    return [
      {
        id: firstPost.id,
        postId: ids.map((p) => p.postId).join(','),
        releaseURL: ids.map((p) => p.releaseURL).join(','),
        status: 'published',
      },
    ];
  }

  async comment(
    id: string,
    postId: string,
    lastCommentId: string | undefined,
    accessToken: string,
    postDetails: PostDetails<FarcasterDto>[],
    integration: Integration
  ): Promise<PostResponse[]> {
    const [commentPost] = postDetails;
    const ids: { releaseURL: string; postId: string }[] = [];

    // postId can be comma-separated if posted to multiple channels
    const parentIds = (lastCommentId || postId).split(',');

    for (const parentHash of parentIds) {
      ids.push(
        await this.publishCast(
          accessToken,
          {
            text: commentPost.message,
            embeds: (commentPost?.media || []).map((media) => ({
              url: media.path,
            })),
            parent: parentHash,
          },
          integration
        )
      );
    }

    return [
      {
        id: commentPost.id,
        postId: ids.map((p) => p.postId).join(','),
        releaseURL: ids.map((p) => p.releaseURL).join(','),
        status: 'published',
      },
    ];
  }

  @Tool({
    description: 'Search channels',
    dataSchema: [{ key: 'word', type: 'string', description: 'Search word' }],
  })
  async subreddits(
    accessToken: string,
    data: any,
    id: string,
    integration: Integration
  ) {
    // a busca nao usa o signer: uma falha aqui nunca deve virar RefreshToken
    // (o /integrations/function desconectaria um canal saudavel)
    try {
      const search: {
        channels?: { id?: string; name?: string }[];
      } = await (
        await this.fetch(
          `${NEYNAR_API}/channel/search/?q=${encodeURIComponent(
            String(data?.word || '')
          )}&limit=10`,
          { headers: this.neynarHeaders() },
          'farcaster-search-channels'
        )
      ).json();

      return (search?.channels || []).map((p) => ({
        title: p.name,
        name: p.name,
        id: p.id,
      }));
    } catch (err) {
      this._logger.warn(
        `busca de canais do Farcaster falhou: ${summarizeError(err)}`
      );
      return [];
    }
  }
}
