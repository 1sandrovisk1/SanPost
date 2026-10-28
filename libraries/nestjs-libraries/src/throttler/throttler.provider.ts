import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { extractBasicCredentials } from '@gitroom/nestjs-libraries/chat/oauth-types';

const canonicalPath = (req: { path?: string; url?: string }) =>
  (req.path || req.url?.split('?')[0] || '')
    .toLowerCase()
    .replace(/^\/api(?=\/)/, '')
    .replace(/\/+$/, '');

// rotas sensiveis com orcamento proprio: troca de codigo OAuth (segredo do
// cliente sem login, contra forca bruta) e o teste manual de feed do autopost
// (download de URL externa)
const sensitiveBucket = (req: { method?: string; path?: string; url?: string }) => {
  if (req.method !== 'POST') {
    return undefined;
  }
  const route = canonicalPath(req);
  if (route === '/oauth/token') {
    return 'oauth';
  }
  if (route === '/autopost/send') {
    return 'autopost-send';
  }
  return undefined;
};

@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  public override async canActivate(
    context: ExecutionContext
  ): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const route = canonicalPath(req);
    const mutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
    const publicPosts =
      req.method === 'POST' && /^\/public\/v1\/posts(?:\/|$)/.test(route);
    const automation =
      /^(?:\/public\/v1)?\/(?:automations|flows|flows-v2|post-management)(?:\/|$)/.test(
        route
      ) || /^\/facebook-automations(?:\/|$)/.test(route);
    const historyRead =
      ['GET', 'HEAD'].includes(req.method) &&
      (/^\/public\/v1\/automations\/[^/]+\/history(?:\/[^/]+)?$/.test(route) ||
        /^\/automation-history\/(?:instagram|shared)\/[^/]+(?:\/[^/]+)?$/.test(
          route
        ));
    const resource = req.query?.resource;
    const remoteRead =
      req.method === 'GET' &&
      (/\/(?:posts|stories|readiness|check|webhook-status)$/.test(route) ||
        (route.endsWith('/options') &&
          ['posts', 'stories', 'readiness', 'resolve_post'].includes(
            String(resource)
          )));
    // Webhooks have their own signature/authentication; this policy only covers
    // authenticated automation routes and preserves the existing posts budget.
    if (
      publicPosts ||
      historyRead ||
      !!sensitiveBucket(req) ||
      (automation && (mutation || remoteRead))
    ) {
      return super.canActivate(context);
    }
    return true;
  }

  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    const sensitive = sensitiveBucket(req);
    if (sensitive === 'oauth') {
      // sem login e atras de proxy (sem trust proxy o req.ip e o do nginx):
      // conta por app cliente, nao por IP — um balde global deixaria qualquer
      // um bloquear a troca de token de todos os apps
      const clientId =
        extractBasicCredentials(req.headers?.authorization)?.clientId ||
        (typeof req.body?.client_id === 'string' ? req.body.client_id : '');
      return 'oauth_client_' + (clientId.slice(0, 120) || 'unknown');
    }
    const identity = req.org?.id || req.ip;
    if (sensitive) {
      return identity + '_' + sensitive;
    }
    return (
      identity +
      '_' +
      (/^\/public\/v1\/posts(?:\/|$)/.test(canonicalPath(req))
        ? 'posts'
        : 'other')
    );
  }
}
