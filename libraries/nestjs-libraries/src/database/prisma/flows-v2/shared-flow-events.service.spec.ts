import { createHmac } from 'node:crypto';
import { SharedFlowEventsService } from './shared-flow-events.service';
describe('recepcao compartilhada', () => {
  const event = {
    organizationId: 'org',
    profileId: 'profile-b',
    integrationId: 'int-b',
    platform: 'instagram' as const,
    remoteAccountId: '123',
    externalEventId: '456',
    externalPostId: '789',
    externalActorId: '999',
    text: 'link',
    occurredAt: Date.now(),
  };
  const raw = Buffer.from('{"entry":[]}');
  const signature = (secret: string) =>
    `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`;
  let repo: { integration: jest.Mock; ingest: jest.Mock };
  let credentials: { getRawShared: jest.Mock };
  beforeEach(() => {
    process.env.SHARED_AUTOMATIONS_ENABLED = 'true';
    repo = {
      integration: jest
        .fn()
        .mockResolvedValue({
          internalId: '123',
          providerIdentifier: 'instagram',
        }),
      ingest: jest.fn().mockResolvedValue(['execution']),
    };
    credentials = {
      getRawShared: jest
        .fn()
        .mockResolvedValue({
          clientSecret: 'secret-b',
          instagramAppSecret: 'ig-b',
        }),
    };
  });
  afterEach(() => {
    delete process.env.SHARED_AUTOMATIONS_ENABLED;
  });
  it('nao aceita assinatura de outro perfil na mesma organizacao', async () => {
    const service = new SharedFlowEventsService(
      repo as any,
      credentials as any
    );
    expect(
      await service.receiveInstagram(event, raw, signature('secret-a'))
    ).toEqual([]);
    expect(repo.ingest).not.toHaveBeenCalled();
    expect(credentials.getRawShared).toHaveBeenCalledWith(
      'org',
      'facebook',
      'profile-b'
    );
    expect(
      await service.receiveInstagram(event, raw, signature('secret-b'))
    ).toEqual(['execution']);
  });
  it('nao usa bypass de desenvolvimento para V2 e limita eventos invalidos', async () => {
    const service = new SharedFlowEventsService(
      repo as any,
      credentials as any
    );
    expect(await service.receiveInstagram(event, raw, undefined)).toEqual([]);
    expect(await service.receive({ ...event, externalActorId: '123' })).toEqual(
      []
    );
    expect(
      await service.receive({ ...event, externalPostId: '../me' })
    ).toEqual([]);
    expect(repo.ingest).not.toHaveBeenCalled();
  });
});
