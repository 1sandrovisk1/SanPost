jest.mock('@gitroom/nestjs-libraries/upload/upload.factory', () => ({
  UploadFactory: { createStorage: jest.fn().mockReturnValue({}) },
}));
import { createPrismaRepositoryMock } from '../../../test';
import { IntegrationRepository } from './integration.repository';

const build = () => {
  const channel = createPrismaRepositoryMock('integration');
  const plug = createPrismaRepositoryMock('plugs');
  const repo = new IntegrationRepository(
    channel as any,
    {} as any,
    plug as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );
  return { repo, channel: channel.model.integration, plug: plug.model.plugs };
};

describe('IntegrationRepository - side effects de organizacao excluida', () => {
  it('carregamento de canal tambem exige organizacao viva', async () => {
    const { repo, channel } = build();
    await repo.getIntegrationById('org', 'channel');
    expect(channel.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'channel',
          organizationId: 'org',
          deletedAt: null,
          organization: { deletedAt: null },
        }),
      })
    );
  });
  it('plug em historico so resolve ativo com canal e organizacao vivos', async () => {
    const { repo, plug } = build();
    await repo.getPlug('plug-id');
    expect(plug.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'plug-id',
        activated: true,
        integration: {
          deletedAt: null,
          disabled: false,
          organization: { deletedAt: null },
        },
      },
      include: { integration: true },
    });
  });
});
