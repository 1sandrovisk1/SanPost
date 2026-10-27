import { CredentialRepository } from './credential.repository';
import { createPrismaRepositoryMock } from '@gitroom/nestjs-libraries/test';

describe('refresh condicional de credencial', () => {
  it.each([undefined, 'profile'])('exige escopo exato e snapshot cifrado no CAS (%s)', async (profileId) => {
    const mock = createPrismaRepositoryMock('providerCredential');
    const repo = new CredentialRepository(mock as any);
    await repo.findExactByProvider('org', 'facebook', profileId);
    expect(mock.model.providerCredential.findFirst).toHaveBeenCalledWith({ where: { organizationId: 'org', provider: 'facebook', profileId: profileId ?? null } });
    await repo.replaceIfUnchanged('org', 'facebook', profileId, 'row', 'old-ciphertext', 'new-ciphertext');
    expect(mock.model.providerCredential.updateMany).toHaveBeenCalledWith({ where: { id: 'row', organizationId: 'org', provider: 'facebook', profileId: profileId ?? null, encryptedData: 'old-ciphertext' }, data: { encryptedData: 'new-ciphertext' } });
    expect(mock.model.providerCredential.create).not.toHaveBeenCalled();
  });
});
