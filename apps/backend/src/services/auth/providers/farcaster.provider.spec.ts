import 'reflect-metadata';
import { FarcasterProvider as FarcasterSocialProvider } from '@gitroom/nestjs-libraries/integrations/social/farcaster.provider';
import { FarcasterProvider } from './farcaster.provider';

const SIGNER = '19d0c5fd-9b33-4a48-a0e2-bc7b0555baec';
const codeFor = (data: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(data)).toString('base64');

describe('FarcasterProvider (login)', () => {
  let lookupSigner: jest.SpyInstance;

  beforeEach(() => {
    lookupSigner = jest.spyOn(FarcasterSocialProvider.prototype, 'lookupSigner');
  });

  afterEach(() => {
    lookupSigner.mockRestore();
  });

  describe('getToken', () => {
    it('devolve o signer_uuid quando o signer esta aprovado', async () => {
      lookupSigner.mockResolvedValue({ status: 'approved', fid: 777 });

      await expect(
        new FarcasterProvider().getToken(codeFor({ signer_uuid: SIGNER, fid: 1 }))
      ).resolves.toBe(SIGNER);
      expect(lookupSigner).toHaveBeenCalledWith(SIGNER);
    });

    it('signer pendente nao vira token', async () => {
      lookupSigner.mockResolvedValue({ status: 'pending_approval' });

      await expect(
        new FarcasterProvider().getToken(codeFor({ signer_uuid: SIGNER }))
      ).resolves.toBe('');
    });

    it('code invalido nao consulta a Neynar', async () => {
      await expect(new FarcasterProvider().getToken('lixo')).resolves.toBe('');
      expect(lookupSigner).not.toHaveBeenCalled();
    });
  });

  describe('getUser', () => {
    it('identifica pelo fid do signer aprovado', async () => {
      lookupSigner.mockResolvedValue({ status: 'approved', fid: 777 });

      await expect(new FarcasterProvider().getUser(SIGNER)).resolves.toEqual({
        id: 'farcaster_777',
        email: 'farcaster_777',
      });
    });

    it('signer nao aprovado nao gera identidade (antes saia id vazio)', async () => {
      lookupSigner.mockResolvedValue({ status: 'revoked' });

      await expect(new FarcasterProvider().getUser(SIGNER)).resolves.toBe(false);
    });

    it('token vazio ou fora do formato e recusado sem consultar a Neynar', async () => {
      await expect(new FarcasterProvider().getUser('')).resolves.toBe(false);
      expect(lookupSigner).not.toHaveBeenCalled();
    });
  });

  it('generateLink continua vazio (o fork nao tem o cookie oauth_state)', () => {
    expect(new FarcasterProvider().generateLink()).toBe('');
  });
});
