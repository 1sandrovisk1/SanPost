import 'reflect-metadata';
import {
  FacebookAutomationsController,
  FacebookAutomationsWebhookController,
} from './facebook-automations.controller';
import { CHECK_POLICIES_KEY } from '../../services/auth/permissions/permissions.ability';
import { Sections } from '../../services/auth/permissions/permission.exception.class';
import { validate } from 'class-validator';
import {
  CompleteFacebookAutomationDto,
  SendFacebookPrivateReplyTestDto,
} from '@gitroom/nestjs-libraries/dtos/integrations/facebook-automation.dto';

describe('FacebookAutomationsController', () => {
  it('exige politica ADMIN em cada handler privado', () => {
    for (const name of [
      'list',
      'appWebhook',
      'view',
      'authorize',
      'useSystemUser',
      'complete',
      'activate',
      'check',
      'previewPrivateReply',
      'sendPrivateReply',
    ] as const) {
      const policies = Reflect.getMetadata(
        CHECK_POLICIES_KEY,
        FacebookAutomationsController.prototype[name]
      );
      expect(
        policies.some((policy: unknown[]) => policy[1] === Sections.ADMIN)
      ).toBe(true);
    }
  });
  it.each([
    [undefined, 'profile'],
    ['org', undefined],
    ['other', 'profile'],
    ['org', 'other'],
  ])(
    'recusa contexto esperado divergente sem acessar credenciais',
    (orgId, profileId) => {
      const service = { useSystemUser: jest.fn() };
      const controller = new FacebookAutomationsController(
        service as any,
        {} as any
      );
      expect(() =>
        controller.useSystemUser(
          { id: 'org' } as any,
          { id: 'profile' } as any,
          { id: 'user' } as any,
          'integration',
          orgId,
          profileId
        )
      ).toThrow('CREDENTIAL_SCOPE_CHANGED');
      expect(service.useSystemUser).not.toHaveBeenCalled();
    }
  );
  it('autoriza sistema com identidade autenticada e headers confirmados', async () => {
    const service = { useSystemUser: jest.fn() };
    const controller = new FacebookAutomationsController(
      service as any,
      {} as any
    );
    await controller.useSystemUser(
      { id: 'org' } as any,
      { id: 'profile' } as any,
      { id: 'user' } as any,
      'integration',
      'org',
      'profile'
    );
    expect(service.useSystemUser).toHaveBeenCalledWith(
      { organizationId: 'org', profileId: 'profile', userId: 'user' },
      'integration'
    );
  });
  it('le o webhook do app com contexto autenticado e sem cache', async () => {
    const service = { viewWebhook: jest.fn() };
    const controller = new FacebookAutomationsController(
      service as any,
      {} as any
    );
    await controller.appWebhook(
      { id: 'org' } as any,
      { id: 'profile' } as any,
      { id: 'user' } as any
    );
    expect(service.viewWebhook).toHaveBeenCalledWith({
      organizationId: 'org',
      profileId: 'profile',
      userId: 'user',
    });
    expect(
      Reflect.getMetadata(
        '__headers__',
        FacebookAutomationsController.prototype.appWebhook
      )
    ).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
  });
  it('passa org, perfil e usuario autenticados para o servico', async () => {
    const service = {
      authorize: jest.fn().mockResolvedValue({ url: 'https://facebook.com' }),
    };
    const controller = new FacebookAutomationsController(
      service as any,
      {} as any
    );
    await controller.authorize(
      { id: 'org' } as any,
      { id: 'profile' } as any,
      { id: 'user' } as any,
      'integration'
    );
    expect(service.authorize).toHaveBeenCalledWith(
      { organizationId: 'org', profileId: 'profile', userId: 'user' },
      'integration'
    );
  });
  it('encaminha somente revisao e contexto autenticado no teste privado', async () => {
    const proof = { send: jest.fn(), view: jest.fn() };
    const controller = new FacebookAutomationsController(
      {} as any,
      proof as any
    );
    const args = [
      { id: 'org' },
      { id: 'profile' },
      { id: 'user' },
      'integration',
    ] as const;
    await controller.sendPrivateReply(
      args[0] as any,
      args[1] as any,
      args[2] as any,
      args[3],
      { revision: 'a'.repeat(64) }
    );
    expect(proof.send).toHaveBeenCalledWith(
      { organizationId: 'org', profileId: 'profile', userId: 'user' },
      'integration',
      { revision: 'a'.repeat(64) }
    );
    expect(
      await validate(
        Object.assign(new SendFacebookPrivateReplyTestDto(), {
          revision: 'bad',
        })
      )
    ).toHaveLength(1);
  });
  it('passa bytes brutos e assinatura sem reconstruir JSON', async () => {
    const service = {
      receive: jest.fn().mockResolvedValue({ received: true }),
    };
    const controller = new FacebookAutomationsWebhookController(service as any);
    const raw = Buffer.from('{ "object": "page" }');
    await controller.receive('123', { rawBody: raw } as any, 'signature');
    expect(service.receive).toHaveBeenCalledWith('123', raw, 'signature');
  });
  it('valida state e limites do codigo antes de completar OAuth', async () => {
    const dto = Object.assign(new CompleteFacebookAutomationDto(), {
      state: 'other',
      code: 'x'.repeat(4097),
    });
    expect((await validate(dto)).map((error) => error.property).sort()).toEqual(
      ['code', 'state']
    );
  });
});
