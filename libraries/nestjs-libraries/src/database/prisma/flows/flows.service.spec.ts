jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManagerMock {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/integrations/integration.service',
  () => ({ IntegrationService: class IntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/instagram-messaging.service',
  () => ({ InstagramMessagingService: class InstagramMessagingServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/credentials/credential.service',
  () => ({ CredentialService: class CredentialServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/profiles/profile.service',
  () => ({ ProfileService: class ProfileServiceMock {} })
);

import { BadRequestException } from '@nestjs/common';
import { FlowNodeType, FlowStatus } from '@prisma/client';
import { TemporalService } from 'nestjs-temporal-core';
import { createMock } from '@gitroom/nestjs-libraries/test';
import { IntegrationService } from '../integrations/integration.service';
import { ProfileService } from '../profiles/profile.service';
import { CredentialService } from '../credentials/credential.service';
import { StatusEventService } from '../status/status-event.service';
import { IntegrationManager } from '../../../integrations/integration.manager';
import { InstagramMessagingService } from '../../../integrations/social/instagram-messaging.service';
import { EncryptionService } from '../../../crypto/encryption.service';
import {
  QuickCreateFlowDto,
  SaveCanvasDto,
} from '../../../dtos/flows/flow.dto';
import { FlowsRepository } from './flows.repository';
import { FlowsService } from './flows.service';

const ORG = 'org-1';
const PROFILE = 'profile-1';
const FLOW = 'flow-1';
const INTEGRATION = 'integration-1';
const ALTERNATIVES = ['Ola {commenter_name}', 'Aqui esta o conteudo'];
const BUTTON = {
  buttonText: 'Abrir conteudo',
  buttonUrl: 'https://example.com',
};

function canvas(config: Record<string, unknown>): SaveCanvasDto {
  return {
    nodes: [
      {
        id: 'trigger',
        type: FlowNodeType.TRIGGER,
        data: JSON.stringify({ triggerType: 'comment_on_post', mode: 'all' }),
        positionX: 0,
        positionY: 0,
      },
      {
        id: 'private',
        type: FlowNodeType.SEND_DM,
        data: JSON.stringify(config),
        positionX: 0,
        positionY: 150,
      },
    ],
    edges: [{ sourceNodeId: 'trigger', targetNodeId: 'private' }],
  };
}

function quick(messages: unknown): QuickCreateFlowDto {
  return {
    name: 'Teste de alternativas',
    integrationId: INTEGRATION,
    activate: false,
    postMode: 'all',
    dmMessages: messages as string[],
    dmButtonText: BUTTON.buttonText,
    dmButtonUrl: BUTTON.buttonUrl,
  };
}

const invalidAlternatives: Array<[string, unknown]> = [
  ['lista vazia', []],
  ['somente espacos', ['  \n\t ']],
  ['item nao textual', ['Valida', 42]],
  ['item nulo', ['Valida', null]],
  ['mais de dez alternativas', Array.from({ length: 11 }, () => 'Valida')],
  ['alternativa longa demais', ['a'.repeat(2001)]],
  ['valor escalar', 'Valida'],
  ['valor nulo', null],
];

describe('FlowsService - alternativas de mensagem privada', () => {
  let repository: ReturnType<typeof createMock<FlowsRepository>>;
  let integrations: ReturnType<typeof createMock<IntegrationService>>;
  let profiles: ReturnType<typeof createMock<ProfileService>>;
  let service: FlowsService;

  beforeEach(() => {
    repository = createMock<FlowsRepository>();
    integrations = createMock<IntegrationService>();
    profiles = createMock<ProfileService>();
    profiles.getProfileById.mockResolvedValue({ id: PROFILE } as Awaited<
      ReturnType<ProfileService['getProfileById']>
    >);
    integrations.getIntegrationById.mockResolvedValue({
      id: INTEGRATION,
      organizationId: ORG,
      profileId: PROFILE,
      providerIdentifier: 'instagram',
      disabled: false,
      deletedAt: null,
    } as Awaited<ReturnType<IntegrationService['getIntegrationById']>>);
    repository.createFlow.mockResolvedValue({ id: FLOW } as Awaited<
      ReturnType<FlowsRepository['createFlow']>
    >);
    repository.getFlow.mockResolvedValue({
      id: FLOW,
      organizationId: ORG,
      profileId: PROFILE,
      integrationId: INTEGRATION,
      status: FlowStatus.PAUSED,
      ...canvas({ messages: ALTERNATIVES, ...BUTTON }),
    } as Awaited<ReturnType<FlowsRepository['getFlow']>>);
    service = new FlowsService(
      repository,
      createMock<TemporalService>(),
      integrations,
      createMock<IntegrationManager>(),
      createMock<CredentialService>(),
      createMock<InstagramMessagingService>(),
      profiles,
      createMock<EncryptionService>(),
      createMock<StatusEventService>()
    );
  });

  const expectNoWrites = () => {
    expect(repository.createFlow).not.toHaveBeenCalled();
    expect(repository.updateFlow).not.toHaveBeenCalled();
    expect(repository.saveCanvas).not.toHaveBeenCalled();
    expect(repository.updateFlowStatus).not.toHaveBeenCalled();
  };

  it.each(['quickCreateFlow', 'quickUpdateFlow'] as const)(
    '%s rejeita uma alternativa acima de 640 caracteres com botao compartilhado',
    async (method) => {
      const body = quick(['Valida', 'a'.repeat(641)]);
      const result =
        method === 'quickCreateFlow'
          ? service.quickCreateFlow(ORG, body, PROFILE)
          : service.quickUpdateFlow(ORG, FLOW, body, PROFILE);

      await expect(result).rejects.toThrow(
        new BadRequestException('MESSAGE_TOO_LONG')
      );
      expectNoWrites();
    }
  );

  describe('quickCreateFlow', () => {
    it.each(invalidAlternatives)(
      'rejeita %s antes de criar ou persistir o canvas',
      async (_label, alternatives) => {
        await expect(
          service.quickCreateFlow(ORG, quick(alternatives), PROFILE)
        ).rejects.toThrow(new BadRequestException('INVALID_MESSAGE'));
        expectNoWrites();
      }
    );

    it('mantem alternativas e botao no no privado sem ativar o rascunho', async () => {
      await service.quickCreateFlow(ORG, quick(ALTERNATIVES), PROFILE);

      const [, , nodes, edges, profile] = repository.saveCanvas.mock.calls[0];
      expect(profile).toBe(PROFILE);
      expect(edges).toHaveLength(1);
      const messages = nodes.filter((node) => node.type === 'SEND_DM');
      expect(messages).toHaveLength(1);
      expect(JSON.parse(messages[0].data!)).toEqual({
        messages: ALTERNATIVES,
        ...BUTTON,
      });
      expect(repository.updateFlowStatus).not.toHaveBeenCalled();
    });

    it.each([
      ['com botao', { ...quick(['a'.repeat(640)]) }],
      [
        'sem botao',
        {
          ...quick(['a'.repeat(2000)]),
          dmButtonText: undefined,
          dmButtonUrl: undefined,
        },
      ],
    ])(
      'aceita o limite de texto %s na criacao nativa',
      async (_label, body) => {
        await service.quickCreateFlow(ORG, body, PROFILE);

        const privateNode = repository.saveCanvas.mock.calls[0][2].find(
          (node) => node.type === 'SEND_DM'
        );
        expect(JSON.parse(privateNode!.data!).messages).toEqual(
          body.dmMessages
        );
      }
    );

    it('rejeita mensagem singular e alternativas simultaneas', async () => {
      await expect(
        service.quickCreateFlow(
          ORG,
          { ...quick(ALTERNATIVES), dmMessage: 'Outra mensagem' },
          PROFILE
        )
      ).rejects.toThrow(new BadRequestException('AMBIGUOUS_PRIVATE_REPLY'));
      expectNoWrites();
    });
  });

  describe('quickUpdateFlow', () => {
    it.each(invalidAlternatives)(
      'rejeita %s sem alterar nome, canvas ou estado',
      async (_label, alternatives) => {
        await expect(
          service.quickUpdateFlow(ORG, FLOW, quick(alternatives), PROFILE)
        ).rejects.toThrow(new BadRequestException('INVALID_MESSAGE'));
        expectNoWrites();
      }
    );

    it('mantem todas as alternativas e o botao na edicao de uma regra pausada', async () => {
      await service.quickUpdateFlow(ORG, FLOW, quick(ALTERNATIVES), PROFILE);

      expect(repository.updateFlow).toHaveBeenCalledWith(
        ORG,
        FLOW,
        { name: 'Teste de alternativas' },
        PROFILE
      );
      const nodes = repository.saveCanvas.mock.calls[0][2];
      const message = nodes.find((node) => node.type === 'SEND_DM');
      expect(JSON.parse(message!.data!)).toEqual({
        messages: ALTERNATIVES,
        ...BUTTON,
      });
      expect(repository.updateFlowStatus).not.toHaveBeenCalled();
    });

    it('rejeita representacoes singular e plural simultaneas sem editar a regra', async () => {
      await expect(
        service.quickUpdateFlow(
          ORG,
          FLOW,
          { ...quick(ALTERNATIVES), dmMessage: 'Outra mensagem' },
          PROFILE
        )
      ).rejects.toThrow(new BadRequestException('AMBIGUOUS_PRIVATE_REPLY'));
      expectNoWrites();
    });
  });

  describe('saveCanvas', () => {
    it.each(invalidAlternatives)(
      'rejeita %s mesmo quando o DTO nativo recebe dados JSON',
      async (_label, alternatives) => {
        await expect(
          service.saveCanvas(
            ORG,
            FLOW,
            canvas({ messages: alternatives }),
            PROFILE
          )
        ).rejects.toThrow(new BadRequestException('INVALID_MESSAGE'));
        expectNoWrites();
      }
    );

    it('preserva alternativas, botao e arestas validas sem reescrever o JSON', async () => {
      const body = canvas({ messages: ALTERNATIVES, ...BUTTON });

      await service.saveCanvas(ORG, FLOW, body, PROFILE);

      expect(repository.saveCanvas).toHaveBeenCalledWith(
        ORG,
        FLOW,
        body.nodes,
        body.edges,
        PROFILE
      );
    });

    it('aceita o formato singular existente sem exigir alternativas', async () => {
      const body = canvas({ message: 'Mensagem existente', ...BUTTON });

      await service.saveCanvas(ORG, FLOW, body, PROFILE);

      expect(repository.saveCanvas).toHaveBeenCalledWith(
        ORG,
        FLOW,
        body.nodes,
        body.edges,
        PROFILE
      );
    });

    it('rejeita qualquer alternativa acima do limite do botao antes de salvar', async () => {
      await expect(
        service.saveCanvas(
          ORG,
          FLOW,
          canvas({ messages: ['Valida', 'a'.repeat(641)], ...BUTTON }),
          PROFILE
        )
      ).rejects.toThrow(new BadRequestException('MESSAGE_TOO_LONG'));
      expectNoWrites();
    });

    it.each([
      ['com botao', { messages: ['a'.repeat(640)], ...BUTTON }],
      ['sem botao', { messages: ['a'.repeat(2000)] }],
    ])('preserva o limite permitido %s', async (_label, config) => {
      const body = canvas(config);

      await service.saveCanvas(ORG, FLOW, body, PROFILE);

      expect(repository.saveCanvas).toHaveBeenCalledWith(
        ORG,
        FLOW,
        body.nodes,
        body.edges,
        PROFILE
      );
    });

    it('nao gera erro de acesso a propriedade ao salvar um JSON nulo legado', async () => {
      const body = canvas({});
      body.nodes[1].data = 'null';

      await service.saveCanvas(ORG, FLOW, body, PROFILE);

      expect(repository.saveCanvas).toHaveBeenCalledWith(
        ORG,
        FLOW,
        body.nodes,
        body.edges,
        PROFILE
      );
    });
  });

  describe('updateFlowStatus', () => {
    it.each(invalidAlternatives)(
      'impede ativacao de canvas persistido com %s',
      async (_label, alternatives) => {
        const flow = await repository.getFlow(ORG, FLOW, PROFILE);
        repository.getFlow.mockResolvedValue({
          ...flow!,
          ...canvas({ messages: alternatives }),
        } as Awaited<ReturnType<FlowsRepository['getFlow']>>);

        await expect(
          service.updateFlowStatus(ORG, FLOW, FlowStatus.ACTIVE, PROFILE)
        ).rejects.toThrow(new BadRequestException('INVALID_MESSAGE'));
        expectNoWrites();
      }
    );

    it('impede ativacao de uma alternativa acima de 640 caracteres com botao', async () => {
      const flow = await repository.getFlow(ORG, FLOW, PROFILE);
      repository.getFlow.mockResolvedValue({
        ...flow!,
        ...canvas({ messages: ['Valida', 'a'.repeat(641)], ...BUTTON }),
      } as Awaited<ReturnType<FlowsRepository['getFlow']>>);

      await expect(
        service.updateFlowStatus(ORG, FLOW, FlowStatus.ACTIVE, PROFILE)
      ).rejects.toThrow(new BadRequestException('MESSAGE_TOO_LONG'));
      expectNoWrites();
    });

    it('permite pausar uma regra legada invalida sem bloquear a interrupcao', async () => {
      repository.getFlow.mockResolvedValue({
        id: FLOW,
        ...canvas({ messages: ['   '] }),
      } as Awaited<ReturnType<FlowsRepository['getFlow']>>);
      await service.updateFlowStatus(ORG, FLOW, FlowStatus.PAUSED, PROFILE);

      expect(repository.updateFlowStatus).toHaveBeenCalledWith(
        ORG,
        FLOW,
        FlowStatus.PAUSED,
        PROFILE
      );
      expect(repository.getFlow).not.toHaveBeenCalled();
    });
  });
});
