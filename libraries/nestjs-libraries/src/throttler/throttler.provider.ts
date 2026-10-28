import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';
import { ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { isIP } from 'net';

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

// Teto global por rota: segura o custo mesmo que o limite por cliente seja
// contornado (x-forwarded-for forjado num proxy que so acrescenta o IP).
export const REAL_IP_GLOBAL_CEILING_FACTOR = 10;

const FARCASTER_PROVIDER = 'FARCASTER';

// Guard por rota para endpoints que criam custo fora (porte do upstream
// #2078): conta pelo IP do cliente, nao pela org que o guard global usa.
// Aplicar com `@UseGuards(ThrottlerRealIpGuard)` + `@Throttle(...)`.
// O IP vem do primeiro x-forwarded-for, o que so e confiavel quando o proxy da
// frente sobrescreve o header: em producao o Traefik troca o XFF nao confiavel
// pelo IP do cliente e o nginx do container acrescenta o dele
// (`$proxy_add_x_forwarded_for`), entao o primeiro item e o cliente real. Valor
// que nao e IP cai no req.ip (sem chave arbitraria no Redis).
@Injectable()
export class ThrottlerRealIpGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '')
      .split(',')[0]
      .trim();
    return `ip:${isIP(forwarded) ? forwarded : req.ip}`;
  }

  protected override async handleRequest(
    requestProps: ThrottlerRequest
  ): Promise<boolean> {
    await super.handleRequest(requestProps);
    // sem headers no teto global: os X-RateLimit-* ficam os do cliente
    return super.handleRequest({
      ...requestProps,
      throttler: { ...requestProps.throttler, setHeaders: false },
      limit: requestProps.limit * REAL_IP_GLOBAL_CEILING_FACTOR,
      getTracker: async () => 'all',
    });
  }
}

// Rotas autenticadas que criam custo fora: conta por org + usuario (o
// AuthMiddleware ja preencheu req.org/req.user), com o mesmo teto global.
@Injectable()
export class ThrottlerOrgUserGuard extends ThrottlerRealIpGuard {
  protected override async getTracker(
    req: Record<string, any>
  ): Promise<string> {
    if (req.org?.id && req.user?.id) {
      return `org:${req.org.id}:user:${req.user.id}`;
    }
    return super.getTracker(req);
  }
}

// Troca do code do login social (/auth/oauth/:provider/exists, /auth/login,
// /auth/register): limita so quando o provider e FARCASTER — os demais logins
// seguem sem este limite.
@Injectable()
export class ThrottlerFarcasterLoginGuard extends ThrottlerRealIpGuard {
  protected override async shouldSkip(
    context: ExecutionContext
  ): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const provider = String(
      req.params?.provider || req.body?.provider || ''
    ).toUpperCase();
    return provider !== FARCASTER_PROVIDER;
  }
}
