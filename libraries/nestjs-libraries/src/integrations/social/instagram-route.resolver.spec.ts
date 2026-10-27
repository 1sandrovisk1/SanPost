import { createMock } from '@gitroom/nestjs-libraries/test';
import { InstagramMessagingService } from './instagram-messaging.service';
import {
  resolveIgRoute,
  IG_LOGIN_GRAPH,
  FB_LOGIN_GRAPH,
} from './instagram-route.resolver';

describe('resolveIgRoute - regressao antes da automacao Facebook', () => {
  const integration = {
    token: 'PAGE_TOKEN',
    providerIdentifier: 'instagram',
    organizationId: 'org',
    profileId: 'profile',
    internalId: 'ig',
  };
  it('standalone usa somente seu token e host sem consultar credencial de outra camada', async () => {
    const messaging = createMock<InstagramMessagingService>();
    expect(
      await resolveIgRoute(
        {
          ...integration,
          providerIdentifier: 'instagram-standalone',
          token: 'STANDALONE',
        },
        messaging
      )
    ).toEqual({
      token: 'STANDALONE',
      host: IG_LOGIN_GRAPH,
      useIgGraph: true,
      source: 'standalone',
    });
    expect(messaging.resolveIgUserToken).not.toHaveBeenCalled();
  });
  it('Facebook Login com token IG no perfil preserva prioridade IG', async () => {
    const messaging = createMock<InstagramMessagingService>();
    messaging.resolveIgUserToken.mockResolvedValue('IG_TOKEN');
    expect(await resolveIgRoute(integration, messaging)).toEqual({
      token: 'IG_TOKEN',
      host: IG_LOGIN_GRAPH,
      useIgGraph: true,
      source: 'ig-user-token',
    });
    expect(messaging.resolveIgUserToken).toHaveBeenCalledWith(
      'org',
      'profile',
      'ig'
    );
  });
  it('sem token IG mantem Page token do Instagram legado', async () => {
    const messaging = createMock<InstagramMessagingService>();
    messaging.resolveIgUserToken.mockResolvedValue(null);
    expect(await resolveIgRoute(integration, messaging)).toEqual({
      token: 'PAGE_TOKEN',
      host: FB_LOGIN_GRAPH,
      useIgGraph: false,
      source: 'page-access-token',
    });
  });
});
