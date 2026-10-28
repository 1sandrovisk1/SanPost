import 'reflect-metadata';
import { mnemonicToAccount } from 'viem/accounts';
import { recoverTypedDataAddress } from 'viem';

const mockSsrfSafeFetch = jest.fn();

jest.mock(
  '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher',
  () => ({
    ssrfSafeFetch: mockSsrfSafeFetch,
  })
);
jest.mock('@gitroom/helpers/utils/timer', () => ({
  timer: jest.fn().mockResolvedValue(undefined),
}));

import {
  decodeFarcasterSignerUuid,
  FARCASTER_RECONNECT_MESSAGE,
  FarcasterNotConfiguredError,
  FarcasterProvider,
} from './farcaster.provider';
import {
  BadBody,
  RefreshToken,
} from '@gitroom/nestjs-libraries/integrations/social.abstract';

// mnemonic publico de teste (Hardhat) — nunca usado fora deste spec
const TEST_MNEMONIC =
  'test test test test test test test test test test test junk';
const SIGNER = '19d0c5fd-9b33-4a48-a0e2-bc7b0555baec';
const OTHER_SIGNER = '0b1e2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const PUBLIC_KEY = `0x${'ab'.repeat(32)}`;
const APPROVAL_URL =
  'https://client.farcaster.xyz/deeplinks/signed-key-request?token=0xabc';

const json = (body: unknown, status = 200) =>
  ({
    status,
    ok: status < 400,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response);

const call = (index: number) => {
  const [url, options] = mockSsrfSafeFetch.mock.calls[index];
  return {
    url: String(url),
    options: options as RequestInit,
    body: options?.body ? JSON.parse(String(options.body)) : undefined,
    headers: (options?.headers || {}) as Record<string, string>,
  };
};

const codeFor = (data: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(data)).toString('base64');

const ENV_KEYS = [
  'NEYNAR_SECRET_KEY',
  'NEYNAR_APP_FID',
  'NEYNAR_APP_MNEMONIC',
  'NEYNAR_SPONSOR_SIGNERS',
];

describe('FarcasterProvider (Neynar managed signers)', () => {
  const env: Record<string, string | undefined> = {};
  let provider: FarcasterProvider;

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      env[key] = process.env[key];
    }
    process.env.NEYNAR_SECRET_KEY = 'neynar-secret-key';
    process.env.NEYNAR_APP_FID = '4242';
    process.env.NEYNAR_APP_MNEMONIC = TEST_MNEMONIC;
    delete process.env.NEYNAR_SPONSOR_SIGNERS;
    mockSsrfSafeFetch.mockReset();
    provider = new FarcasterProvider();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (env[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = env[key];
      }
    }
  });

  describe('createSigner', () => {
    it.each(['NEYNAR_SECRET_KEY', 'NEYNAR_APP_FID', 'NEYNAR_APP_MNEMONIC'])(
      'falha fechada sem %s e nao chama a Neynar',
      async (key) => {
        delete process.env[key];

        await expect(provider.createSigner()).rejects.toBeInstanceOf(
          FarcasterNotConfiguredError
        );
        expect(provider.isConfigured()).toBe(false);
        expect(mockSsrfSafeFetch).not.toHaveBeenCalled();
      }
    );

    it('recusa NEYNAR_APP_FID que nao e inteiro positivo', async () => {
      process.env.NEYNAR_APP_FID = 'abc';

      await expect(provider.createSigner()).rejects.toBeInstanceOf(
        FarcasterNotConfiguredError
      );
    });

    it('cria o signer, assina o SignedKeyRequest com a conta do app e devolve QR', async () => {
      mockSsrfSafeFetch
        .mockResolvedValueOnce(
          json({ signer_uuid: SIGNER, public_key: PUBLIC_KEY, status: 'generated' })
        )
        .mockResolvedValueOnce(
          json({
            signer_uuid: SIGNER,
            status: 'pending_approval',
            signer_approval_url: APPROVAL_URL,
          })
        );
      const before = Math.floor(Date.now() / 1000);

      const result = await provider.createSigner();

      expect(result.signerUuid).toBe(SIGNER);
      expect(result.approvalUrl).toBe(APPROVAL_URL);
      expect(result.qrCode).toMatch(/^data:image\/png;base64,/);

      const create = call(0);
      expect(create.url).toBe('https://api.neynar.com/v2/farcaster/signer/');
      expect(create.options.method).toBe('POST');
      expect(create.headers['x-api-key']).toBe('neynar-secret-key');

      const register = call(1);
      expect(register.url).toBe(
        'https://api.neynar.com/v2/farcaster/signer/signed_key/'
      );
      expect(register.body).toMatchObject({ signer_uuid: SIGNER, app_fid: 4242 });
      expect(register.body.sponsor).toBeUndefined();
      expect(register.body.deadline).toBeGreaterThanOrEqual(before + 86400);
      expect(register.body.deadline).toBeLessThanOrEqual(before + 86400 + 5);

      // a assinatura e da carteira de custodia do app sobre a chave do signer
      const signer = await recoverTypedDataAddress({
        domain: {
          name: 'Farcaster SignedKeyRequestValidator',
          version: '1',
          chainId: 10,
          verifyingContract: '0x00000000fc700472606ed4fa22623acf62c60553',
        },
        types: {
          SignedKeyRequest: [
            { name: 'requestFid', type: 'uint256' },
            { name: 'key', type: 'bytes' },
            { name: 'deadline', type: 'uint256' },
          ],
        },
        primaryType: 'SignedKeyRequest',
        message: {
          requestFid: BigInt(4242),
          key: PUBLIC_KEY as `0x${string}`,
          deadline: BigInt(register.body.deadline),
        },
        signature: register.body.signature,
      });
      expect(signer).toBe(mnemonicToAccount(TEST_MNEMONIC).address);

      // nada de segredo no que volta ao navegador
      expect(JSON.stringify(result)).not.toContain('neynar-secret-key');
      expect(JSON.stringify(result)).not.toContain('junk');
    });

    it('NEYNAR_SPONSOR_SIGNERS=true pede o patrocinio da Neynar', async () => {
      process.env.NEYNAR_SPONSOR_SIGNERS = 'true';
      mockSsrfSafeFetch
        .mockResolvedValueOnce(json({ signer_uuid: SIGNER, public_key: PUBLIC_KEY }))
        .mockResolvedValueOnce(json({ signer_approval_url: APPROVAL_URL }));

      await provider.createSigner();

      expect(call(1).body.sponsor).toEqual({ sponsored_by_neynar: true });
    });

    it.each([
      'javascript:alert(1)',
      'http://client.farcaster.xyz/x',
      undefined,
    ])('recusa URL de aprovacao insegura (%s)', async (url) => {
      mockSsrfSafeFetch
        .mockResolvedValueOnce(json({ signer_uuid: SIGNER, public_key: PUBLIC_KEY }))
        .mockResolvedValueOnce(json({ signer_approval_url: url }));

      await expect(provider.createSigner()).rejects.toThrow(
        'A Neynar não devolveu uma URL de aprovação válida'
      );
    });

    it('recusa resposta da Neynar sem signer_uuid/public_key validos', async () => {
      mockSsrfSafeFetch.mockResolvedValueOnce(json({ signer_uuid: 'x' }));

      await expect(provider.createSigner()).rejects.toThrow(
        'Resposta inesperada da Neynar ao criar o signer'
      );
      expect(mockSsrfSafeFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('signerStatus (polling da aprovacao)', () => {
    it('pendente devolve so o status, sem code', async () => {
      mockSsrfSafeFetch.mockResolvedValueOnce(
        json({ signer_uuid: SIGNER, status: 'pending_approval' })
      );

      await expect(provider.signerStatus(SIGNER)).resolves.toEqual({
        status: 'pending_approval',
      });
      expect(call(0).url).toBe(
        `https://api.neynar.com/v2/farcaster/signer/?signer_uuid=${SIGNER}`
      );
      expect(mockSsrfSafeFetch).toHaveBeenCalledTimes(1);
    });

    it('revogado devolve revoked', async () => {
      mockSsrfSafeFetch.mockResolvedValueOnce(json({ status: 'revoked' }));

      await expect(provider.signerStatus(SIGNER)).resolves.toEqual({
        status: 'revoked',
      });
    });

    it('aprovado devolve o code com o fid e o perfil lidos da Neynar', async () => {
      mockSsrfSafeFetch
        .mockResolvedValueOnce(json({ status: 'approved', fid: 777 }))
        .mockResolvedValueOnce(
          json({
            users: [
              {
                fid: 777,
                username: 'alice',
                display_name: 'Alice',
                pfp_url: 'https://img.example/a.png',
              },
            ],
          })
        );

      const result = await provider.signerStatus(SIGNER);

      expect(result.status).toBe('approved');
      expect(JSON.parse(Buffer.from(result.code!, 'base64').toString())).toEqual({
        signer_uuid: SIGNER,
        fid: 777,
        username: 'alice',
        display_name: 'Alice',
        pfp_url: 'https://img.example/a.png',
      });
      expect(call(1).url).toBe(
        'https://api.neynar.com/v2/farcaster/user/bulk/?fids=777'
      );
      expect(mockSsrfSafeFetch).toHaveBeenCalledTimes(2);
    });

    it('rejeita signer_uuid fora do formato sem chamar a Neynar', async () => {
      await expect(provider.signerStatus('../user?x=1')).rejects.toThrow(
        'signer_uuid inválido'
      );
      expect(mockSsrfSafeFetch).not.toHaveBeenCalled();
    });

    it('status desconhecido da Neynar vira pending_approval', async () => {
      mockSsrfSafeFetch.mockResolvedValueOnce(json({ status: 'whatever' }));

      await expect(provider.signerStatus(SIGNER)).resolves.toEqual({
        status: 'pending_approval',
      });
    });
  });

  describe('authenticate', () => {
    it('usa so o signer_uuid do code e confirma fid/perfil na Neynar', async () => {
      mockSsrfSafeFetch
        .mockResolvedValueOnce(json({ status: 'approved', fid: 777 }))
        .mockResolvedValueOnce(
          json({ users: [{ fid: 777, username: 'alice', display_name: 'Alice' }] })
        );

      const auth = await provider.authenticate({
        // fid/nome forjados pelo cliente sao ignorados
        code: codeFor({ signer_uuid: SIGNER, fid: 1, username: 'mallory' }),
        codeVerifier: 'x',
      });

      expect(auth).toMatchObject({
        id: '777',
        name: 'Alice',
        username: 'alice',
        accessToken: SIGNER,
        refreshToken: '',
      });
    });

    it('recusa signer que ainda nao foi aprovado', async () => {
      mockSsrfSafeFetch.mockResolvedValueOnce(json({ status: 'pending_approval' }));

      await expect(
        provider.authenticate({ code: codeFor({ signer_uuid: SIGNER }), codeVerifier: 'x' })
      ).rejects.toThrow('A aprovação do Farcaster ainda não foi concluída');
    });

    it.each(['nao-e-base64-json', codeFor({ signer_uuid: 'abc' }), codeFor({})])(
      'recusa code invalido (%s) sem chamar a Neynar',
      async (code) => {
        await expect(
          provider.authenticate({ code, codeVerifier: 'x' })
        ).rejects.toThrow('Código de conexão do Farcaster inválido');
        expect(mockSsrfSafeFetch).not.toHaveBeenCalled();
      }
    );
  });

  describe('decodeFarcasterSignerUuid', () => {
    it('extrai o signer_uuid do code em base64', () => {
      expect(decodeFarcasterSignerUuid(codeFor({ signer_uuid: OTHER_SIGNER }))).toBe(
        OTHER_SIGNER
      );
      expect(decodeFarcasterSignerUuid('%%%')).toBeNull();
    });
  });

  describe('post e comment', () => {
    const integration = { profile: 'alice' } as any;

    it('publica um cast por canal com o signer do canal e devolve ids/URLs', async () => {
      mockSsrfSafeFetch
        .mockResolvedValueOnce(json({ success: true, cast: { hash: '0xaa', author: { fid: 7 } } }))
        .mockResolvedValueOnce(
          json({ success: true, cast: { hash: '0xbb', author: { fid: 7, username: 'alice2' } } })
        );

      const result = await provider.post(
        '7',
        SIGNER,
        [
          {
            id: 'p1',
            message: 'gm',
            media: [{ type: 'image', path: 'https://cdn.example/a.png' }],
            settings: {
              subreddit: [{ value: { id: 'dev' } }, { value: { id: 'base' } }],
            },
          },
        ],
        integration
      );

      expect(result).toEqual([
        {
          id: 'p1',
          postId: '0xaa,0xbb',
          releaseURL:
            'https://warpcast.com/alice/0xaa,https://warpcast.com/alice2/0xbb',
          status: 'published',
        },
      ]);
      expect(call(0).url).toBe('https://api.neynar.com/v2/farcaster/cast/');
      expect(call(0).headers['x-api-key']).toBe('neynar-secret-key');
      expect(call(0).body).toEqual({
        signer_uuid: SIGNER,
        text: 'gm',
        embeds: [{ url: 'https://cdn.example/a.png' }],
        channel_id: 'dev',
      });
      expect(call(1).body.channel_id).toBe('base');
    });

    it('sem canal publica no feed e sem username usa a URL de conversa', async () => {
      mockSsrfSafeFetch.mockResolvedValueOnce(
        json({ success: true, cast: { hash: '0xcc', author: { fid: 7 } } })
      );

      const [result] = await provider.post(
        '7',
        SIGNER,
        [{ id: 'p1', message: 'gm', settings: {} as any }],
        undefined
      );

      expect(call(0).body).toEqual({ signer_uuid: SIGNER, text: 'gm', embeds: [] });
      expect(result.releaseURL).toBe('https://warpcast.com/~/conversations/0xcc');
    });

    it('comment responde a cada hash do post', async () => {
      mockSsrfSafeFetch
        .mockResolvedValueOnce(json({ cast: { hash: '0xc1' } }))
        .mockResolvedValueOnce(json({ cast: { hash: '0xc2' } }));

      const [result] = await provider.comment(
        '7',
        '0xaa,0xbb',
        undefined,
        SIGNER,
        [{ id: 'c1', message: 'reply', settings: {} as any }],
        integration
      );

      expect(call(0).body.parent).toBe('0xaa');
      expect(call(1).body.parent).toBe('0xbb');
      expect(result.postId).toBe('0xc1,0xc2');
    });

    it('resposta sem hash vira BadBody', async () => {
      mockSsrfSafeFetch.mockResolvedValueOnce(json({ success: false }));

      await expect(
        provider.post('7', SIGNER, [{ id: 'p1', message: 'gm', settings: {} as any }], integration)
      ).rejects.toBeInstanceOf(BadBody);
    });
  });

  describe('mapeamento de erros da Neynar', () => {
    it.each([
      [403, { message: 'Forbidden' }, 'refresh-token'],
      [400, { message: 'Signer is not approved' }, 'refresh-token'],
      [404, { message: 'signer not found' }, 'refresh-token'],
      [403, { message: 'User is not allowed to cast in this channel' }, 'bad-body'],
      [401, { message: 'Unauthorized' }, 'bad-body'],
      [402, { message: 'Payment required' }, 'bad-body'],
      [429, { message: 'Too many requests' }, 'bad-body'],
      [400, { message: 'embeds must contain at most 2 items' }, 'bad-body'],
    ])('%s %j vira %s', (status, body, type) => {
      expect(provider.handleErrors(JSON.stringify(body), status)?.type).toBe(type);
    });

    it('5xx fica sem mapeamento para o fetch retentar', () => {
      expect(provider.handleErrors('{}', 500)).toBeUndefined();
      expect(provider.handleErrors('<html>', 502)).toBeUndefined();
    });

    it('400 generico leva a mensagem da Neynar', () => {
      expect(
        provider.handleErrors(JSON.stringify({ message: 'Invalid embed url' }), 400)
      ).toEqual({
        type: 'bad-body',
        value: 'O Farcaster recusou a publicação: Invalid embed url',
      });
    });

    it('signer revogado no post vira RefreshToken com a mensagem de reconexao', async () => {
      mockSsrfSafeFetch.mockResolvedValueOnce(json({ message: 'Forbidden' }, 403));

      const error = await provider
        .post('7', SIGNER, [{ id: 'p1', message: 'gm', settings: {} as any }])
        .catch((e) => e);

      expect(error).toBeInstanceOf(RefreshToken);
      expect(error.message).toBe(FARCASTER_RECONNECT_MESSAGE);
    });

    it('chave da API recusada (401) vira BadBody e nao desconecta o canal', async () => {
      mockSsrfSafeFetch.mockResolvedValueOnce(json({ message: 'Unauthorized' }, 401));

      const error = await provider
        .post('7', SIGNER, [{ id: 'p1', message: 'gm', settings: {} as any }])
        .catch((e) => e);

      expect(error).toBeInstanceOf(BadBody);
      expect(error).not.toBeInstanceOf(RefreshToken);
    });

    it('refreshToken nao renova: pede reconexao com motivo curado', async () => {
      await expect(provider.refreshToken('')).rejects.toThrow(
        FARCASTER_RECONNECT_MESSAGE
      );
      expect(provider.refreshErrorMessage()).toBe(FARCASTER_RECONNECT_MESSAGE);
    });
  });

  describe('subreddits (busca de canais)', () => {
    it('busca na Neynar e mapeia os canais', async () => {
      mockSsrfSafeFetch.mockResolvedValueOnce(
        json({ channels: [{ id: 'dev', name: 'Dev' }] })
      );

      await expect(
        provider.subreddits(SIGNER, { word: 'd v' }, '7', {} as any)
      ).resolves.toEqual([{ title: 'Dev', name: 'Dev', id: 'dev' }]);
      expect(call(0).url).toBe(
        'https://api.neynar.com/v2/farcaster/channel/search/?q=d%20v&limit=10'
      );
    });

    it('falha da busca devolve lista vazia em vez de RefreshToken', async () => {
      mockSsrfSafeFetch.mockResolvedValueOnce(json({ message: 'Forbidden' }, 403));

      await expect(
        provider.subreddits(SIGNER, { word: 'dev' }, '7', {} as any)
      ).resolves.toEqual([]);
    });
  });
});
