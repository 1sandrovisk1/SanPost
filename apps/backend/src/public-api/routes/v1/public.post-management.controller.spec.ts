jest.mock(
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  () => ({})
);
jest.mock('file-type', () => ({ fileTypeFromBuffer: jest.fn() }));
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { PublicPostManagementController } from './public.post-management.controller';
import { PostManagementService } from '@gitroom/nestjs-libraries/database/prisma/posts/post-management.service';
import { managedPostPatchSchema } from '@gitroom/nestjs-libraries/dtos/posts/post-management.dto';
describe('API HTTP de posts gerenciados', () => {
  let app: INestApplication, base: string;
  const service = {
    scope: jest
      .fn()
      .mockResolvedValue({ organizationId: 'org', profileId: 'perfil' }),
    capabilities: jest.fn().mockReturnValue({}),
    list: jest.fn().mockResolvedValue({ posts: [] }),
    detail: jest.fn(),
    update: jest.fn(),
    action: jest.fn(),
    options: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [PublicPostManagementController],
      providers: [{ provide: PostManagementService, useValue: service }],
    }).compile();
    app = module.createNestApplication();
    app.use((req: any, _res: any, next: () => void) => {
      req.org = { id: 'org' };
      req.publicApiProfileId = 'perfil';
      next();
    });
    await app.listen(0, '127.0.0.1');
    base = await app.getUrl();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());
  it('rejeita perfil divergente e campos desconhecidos antes de chamar dominio', async () => {
    expect(
      (await fetch(base + '/public/v1/post-management?profileId=outro')).status
    ).toBe(403);
    expect(
      (
        await fetch(base + '/public/v1/post-management/p', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            expectedVersion: 'v',
            configuration: { extra: true },
          }),
        })
      ).status
    ).toBe(400);
    expect(service.update).not.toHaveBeenCalled();
  });
  it('encaminha patch e acao sem filtrar dados ou reconstruir outro post', async () => {
    const body = {
      expectedVersion: 'v',
      configuration: {
        settings: [{ key: 'is_trial_reel', value: 'false' }],
        messages: [
          {
            id: 'p',
            content: '<p>Texto</p>',
            delay: 5,
            media: [
              { id: 'm', path: 'https://example.com/a.jpg', alt: 'Foto' },
            ],
          },
        ],
      },
    };
    expect(
      (
        await fetch(base + '/public/v1/post-management/p', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
      ).status
    ).toBe(200);
    expect(service.update).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: 'perfil' }),
      'p',
      body
    );
  });
  it('Swagger apresenta todos os campos de configuracao editaveis', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build()
    );
    const body: any =
      doc.paths['/public/v1/post-management/{id}'].put.requestBody;
    expect(
      Object.keys(
        body.content['application/json'].schema.properties.configuration
          .properties
      )
    ).toEqual(Object.keys(managedPostPatchSchema.shape.configuration.shape));
  });
});
