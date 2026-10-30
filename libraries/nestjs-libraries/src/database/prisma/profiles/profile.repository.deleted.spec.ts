import { createPrismaRepositoryMock } from '../../../test';
import { ProfileRepository } from './profile.repository';

describe('ProfileRepository - chave de perfil e exclusao de organizacao', () => {
  it('chave de perfil exige perfil e organizacao vivos', async () => {
    const profile = createPrismaRepositoryMock('profile');
    const repo = new ProfileRepository(
      profile as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      createPrismaRepositoryMock('oAuthAuthorization') as unknown as
        ConstructorParameters<typeof ProfileRepository>[5]
    );
    await repo.getProfileByApiKey('profile-key');
    expect(profile.model.profile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          apiKey: 'profile-key',
          deletedAt: null,
          organization: { deletedAt: null },
        },
      })
    );
  });
});
