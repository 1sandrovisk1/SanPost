import { createParamDecorator, ExecutionContext } from '@nestjs/common';

// usuario que aprovou o app OAuth (token `pos_`); chave de API nao tem
// usuario (upstream 852ac517)
export const GetOAuthUserIdFromRequest = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): string | undefined =>
    (ctx.switchToHttp().getRequest() as any).oauthUserId
);
