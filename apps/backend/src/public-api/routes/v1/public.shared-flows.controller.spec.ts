jest.mock(
  '@gitroom/nestjs-libraries/integrations/automations/comment-channel.service',
  () => ({ CommentChannelService: jest.fn() })
);
import { PublicSharedFlowsController } from './public.shared-flows.controller';
describe('API publica V2 e agendamentos', () => {
  const service = { save: jest.fn(), get: jest.fn() };
  const scheduled = { list: jest.fn() };
  const controller = new PublicSharedFlowsController(
    service as any,
    scheduled as any
  );
  beforeEach(() => jest.clearAllMocks());
  it('recusa chave de perfil em outro perfil antes de buscar o post', () => {
    expect(() =>
      controller.listPosts({ id: 'o' } as any, 'a', 'b', 'i')
    ).toThrow('PROFILE_KEY_MISMATCH');
    expect(scheduled.list).not.toHaveBeenCalled();
  });
  it('preserva referencia interna e escopo no contrato de criacao', () => {
    const input = {
      name: 'Agendado',
      channels: [
        {
          integrationId: 'i',
          postMode: 'scheduled',
          postIds: [],
          scheduledPostId: 'local',
        },
      ],
    } as any;
    controller.create({ id: 'o' } as any, 'p', undefined, input);
    expect(service.save).toHaveBeenCalledWith(
      { organizationId: 'o', profileId: 'p' },
      input
    );
  });
  it('nao usa perfil em branco para chave de organizacao', () => {
    expect(() =>
      controller.get({ id: 'o' } as any, undefined, undefined, 'f')
    ).toThrow('PROFILE_REQUIRED');
  });
});
