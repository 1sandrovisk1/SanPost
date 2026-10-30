jest.mock('@gitroom/nestjs-libraries/integrations/integration.manager', () => ({
  IntegrationManager: class IntegrationManagerMock {},
}));
jest.mock(
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  () => ({ RefreshIntegrationService: class RefreshIntegrationServiceMock {} })
);
jest.mock(
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  () => ({ MediaService: class MediaServiceMock {} })
);
jest.mock('@gitroom/nestjs-libraries/short-linking/short.link.service', () => ({
  ShortLinkService: class ShortLinkServiceMock {},
}));
jest.mock('@gitroom/nestjs-libraries/agent/agent.graph.insert.service', () => ({
  AgentGraphInsertService: class AgentGraphInsertServiceMock {},
}));

jest.mock('@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator', () => ({
  ...jest.requireActual(
    '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator'
  ),
  isSafePublicHttpsUrl: jest.fn().mockResolvedValue(true),
}));

import { EventEmitter } from 'events';
import { PublicController } from './public.controller';

// O player de video fecha a conexao antes do upstream responder: o fetch
// aborta e isso nao e erro (antes subia como ExceptionsHandler no log).
describe('PublicController.streamFile (player fechado)', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const build = () =>
    new PublicController(
      null as any,
      null as any,
      null as any,
      null as any,
      null as any,
      null as any
    );

  it('fetch abortado pelo cliente termina sem lancar', async () => {
    const req = new EventEmitter();
    const res = Object.assign(new EventEmitter(), {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn(),
    });
    global.fetch = jest.fn((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('This operation was aborted', 'AbortError'))
        );
        res.emit('close');
      });
    }) as any;

    await expect(
      build().streamFile(
        { url: 'https://cdn.example.com/v.mp4' } as any,
        res as any,
        req as any
      )
    ).resolves.toBeUndefined();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('falha de rede sem abort continua sendo erro', async () => {
    const req = new EventEmitter();
    const res = Object.assign(new EventEmitter(), {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn(),
    });
    global.fetch = jest.fn().mockRejectedValue(new TypeError('fetch failed')) as any;

    await expect(
      build().streamFile(
        { url: 'https://cdn.example.com/v.mp4' } as any,
        res as any,
        req as any
      )
    ).rejects.toThrow('fetch failed');
  });
});
