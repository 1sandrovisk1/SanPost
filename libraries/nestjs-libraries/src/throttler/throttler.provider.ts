import { ThrottlerGuard } from '@nestjs/throttler';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';

const canonicalPath = (req: { path?: string; url?: string }) =>
  (req.path || req.url?.split('?')[0] || '')
    .toLowerCase()
    .replace(/^\/api(?=\/)/, '')
    .replace(/\/+$/, '');

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
      (automation && (mutation || remoteRead))
    ) {
      return super.canActivate(context);
    }
    return true;
  }

  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    const identity = req.org?.id || req.ip;
    return (
      identity +
      '_' +
      (/^\/public\/v1\/posts(?:\/|$)/.test(canonicalPath(req))
        ? 'posts'
        : 'other')
    );
  }
}
