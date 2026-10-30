import { createMock } from '@gitroom/nestjs-libraries/test';
import { OrganizationRepository } from '../organizations/organization.repository';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

describe('UsersService.setTimezone', () => {
  const build = () => {
    const repository = createMock<UsersRepository>();
    const service = new UsersService(
      repository,
      createMock<OrganizationRepository>()
    );
    return { repository, service };
  };

  it.each(['America/Sao_Paulo', 'America/New_York', 'UTC', null])(
    'salva a preferencia valida %s somente no usuario autenticado',
    async (timezoneName) => {
      const { repository, service } = build();
      repository.setTimezone.mockResolvedValue({ timezoneName });

      await expect(
        service.setTimezone('authenticated-user', timezoneName)
      ).resolves.toEqual({ timezoneName });
      expect(repository.setTimezone).toHaveBeenCalledWith(
        'authenticated-user',
        timezoneName
      );
    }
  );

  it.each(['Mars/Olympus', '', 'America/Sao_Paulo ', undefined, 123])(
    'recusa preferencia invalida %s antes de escrever',
    async (timezoneName) => {
      const { repository, service } = build();
      await expect(
        Promise.resolve().then(() =>
          service.setTimezone('user', timezoneName as any)
        )
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.setTimezone).not.toHaveBeenCalled();
    }
  );
});
