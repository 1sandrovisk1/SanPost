import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { Organization, Profile } from '@prisma/client';
import { CredentialService } from '@gitroom/nestjs-libraries/database/prisma/credentials/credential.service';
import {
  InstagramMessagingService,
  IgMessagingTokenEntry,
} from '@gitroom/nestjs-libraries/integrations/social/instagram-messaging.service';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('Credentials')
@Controller('/credentials')
export class CredentialsController {
  constructor(
    private _credentialService: CredentialService,
    private _instagramMessagingService: InstagramMessagingService
  ) {}

  // A stale browser tab must not save tokens into a profile selected elsewhere.
  // These headers assert the original context; they never choose the auth scope.
  private assertMessagingScope(
    org: Organization,
    profile: Profile | null,
    expectedOrg?: string,
    expectedProfile?: string
  ) {
    if (expectedOrg === undefined && expectedProfile === undefined) return;
    if (expectedOrg !== org.id || expectedProfile !== (profile?.id || '')) {
      throw new HttpException({ code: 'MESSAGING_SCOPE_CHANGED' }, 409);
    }
  }

  @Get('/')
  async list(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    return this._credentialService.listByOrg(org.id, profile?.id);
  }

  @Get('/:provider')
  async getByProvider(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('provider') provider: string
  ) {
    const result = await this._credentialService.getRedacted(org.id, provider, profile?.id);
    if (!result) {
      return { provider, data: {}, updatedAt: null };
    }
    return {
      provider,
      data: result.data,
      updatedAt: result.updatedAt.toISOString(),
    };
  }

  @Post('/:provider')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async create(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('provider') provider: string,
    @Body() body: Record<string, string>
  ) {
    await this._credentialService.save(org.id, provider, body, profile?.id);
    const result = await this._credentialService.getRedacted(org.id, provider, profile?.id);
    if (!result) {
      return { provider, data: {}, updatedAt: null };
    }
    return {
      provider,
      data: result.data,
      updatedAt: result.updatedAt.toISOString(),
    };
  }

  @Patch('/:provider')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  async update(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('provider') provider: string,
    @Body() body: Record<string, string>
  ) {
    await this._credentialService.save(org.id, provider, body, profile?.id);
    const result = await this._credentialService.getRedacted(org.id, provider, profile?.id);
    if (!result) {
      return { provider, data: {}, updatedAt: null };
    }
    return {
      provider,
      data: result.data,
      updatedAt: result.updatedAt.toISOString(),
    };
  }

  @Delete('/:provider')
  @HttpCode(204)
  @CheckPolicies([AuthorizationActions.Delete, Sections.ADMIN])
  async remove(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('provider') provider: string
  ) {
    await this._credentialService.delete(org.id, provider, profile?.id);
  }

  @Post('/:provider/test')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async test(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('provider') provider: string,
    @Query('section') section?: string
  ) {
    return this._credentialService.test(org.id, provider, profile?.id, section);
  }

  // --- Messaging tokens (Instagram DM for story automations) ---

  @Post('/facebook/validate-system-token')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async validateSystemToken(@Body() body: { token: string }) {
    return this._instagramMessagingService.validateSystemUserToken(body?.token || '');
  }

  @Post('/facebook/validate-ig-token')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async validateIgToken(@Body() body: { token: string }) {
    return this._instagramMessagingService.validateIgUserToken(body?.token || '');
  }

  @Get('/facebook/messaging-tokens')
  async getMessagingTokens(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Headers('x-expected-org-id') expectedOrg?: string,
    @Headers('x-expected-profile-id') expectedProfile?: string
  ) {
    this.assertMessagingScope(org, profile, expectedOrg, expectedProfile);
    const state = await this._credentialService.getMessagingTokens(
      org.id,
      profile?.id
    );
    return {
      hasSystemToken: !!state.metaSystemUserToken,
      systemTokenValidatedAt: state.metaSystemUserTokenValidatedAt || null,
      systemTokenInfo: state.metaSystemUserTokenInfo || null,
      instagramTokens: state.instagramTokens.map((t: any) => ({
        igUserId: t.igUserId,
        username: t.username,
        refreshedAt: t.refreshedAt,
        validatedAt: t.validatedAt,
        hasToken: !!t.token,
      })),
    };
  }

  @Post('/facebook/messaging-tokens')
  @CheckPolicies([AuthorizationActions.Create, Sections.ADMIN])
  async saveMessagingTokens(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body()
    body: {
      metaSystemUserToken?: string | null;
      instagramTokens?: Array<{
        igUserId: string;
        username?: string;
        token: string;
      }> | null;
    },
    @Headers('x-expected-org-id') expectedOrg?: string,
    @Headers('x-expected-profile-id') expectedProfile?: string
  ) {
    this.assertMessagingScope(org, profile, expectedOrg, expectedProfile);
    const updates: Parameters<
      typeof this._credentialService.updateMessagingTokens
    >[2] = {};

    // --- System User Token ---
    if (body.metaSystemUserToken !== undefined) {
      if (!body.metaSystemUserToken) {
        // Clear
        updates.metaSystemUserToken = null;
        updates.metaSystemUserTokenValidatedAt = null;
        updates.metaSystemUserTokenInfo = null;
      } else {
        const validation =
          await this._instagramMessagingService.validateSystemUserToken(
            body.metaSystemUserToken
          );
        if (!validation.ok) {
          return { ok: false, error: validation.error, field: 'metaSystemUserToken' };
        }
        updates.metaSystemUserToken = body.metaSystemUserToken;
        updates.metaSystemUserTokenValidatedAt = new Date().toISOString();
        updates.metaSystemUserTokenInfo = {
          businessId: validation.businessId,
          businessName: validation.businessName,
          pages: validation.pages || [],
        };
      }
    }

    // --- Per-account IG User Tokens ---
    if (body.instagramTokens !== undefined) {
      if (!body.instagramTokens || body.instagramTokens.length === 0) {
        updates.instagramTokens = [];
      } else {
        // Load existing entries so we can preserve refreshedAt for tokens that
        // were not modified (incoming token empty or same as stored).
        const existing =
          await this._credentialService.getMessagingTokens(
            org.id,
            profile?.id
          );
        const existingMap = new Map<string, IgMessagingTokenEntry>(
          existing.instagramTokens.map((t: any) => [t.igUserId, t])
        );

        const validated: IgMessagingTokenEntry[] = [];
        for (const incoming of body.instagramTokens) {
          if (!incoming.igUserId) continue;
          const prior = existingMap.get(incoming.igUserId);
          // The GET endpoint redacts stored tokens (returns `hasToken`, never
          // the token itself), so when the user adds another account the
          // frontend rebuilds the list carrying the untouched accounts WITHOUT
          // their token. Preserve the existing entry instead of dropping it —
          // otherwise adding a second Instagram silently wipes the first.
          if (!incoming.token) {
            if (prior) validated.push(prior);
            continue;
          }
          // If the incoming token equals the one we already have, skip revalidation
          // and keep the existing refreshedAt. Otherwise, validate the fresh token.
          if (prior && prior.token === incoming.token) {
            validated.push(prior);
            continue;
          }

          const validation =
            await this._instagramMessagingService.validateIgUserToken(
              incoming.token
            );
          if (!validation.ok) {
            return {
              ok: false,
              error: `${incoming.username || incoming.igUserId}: ${validation.error}`,
              field: 'instagramTokens',
            };
          }

          validated.push({
            igUserId: validation.igUserId || incoming.igUserId,
            username: validation.username || incoming.username,
            token: incoming.token,
            refreshedAt: new Date().toISOString(),
            validatedAt: new Date().toISOString(),
          });
        }
        updates.instagramTokens = validated;
      }
    }

    await this._credentialService.updateMessagingTokens(
      org.id,
      profile?.id,
      updates
    );

    // Return fresh redacted state
    const state = await this._credentialService.getMessagingTokens(
      org.id,
      profile?.id
    );
    return {
      ok: true,
      hasSystemToken: !!state.metaSystemUserToken,
      systemTokenValidatedAt: state.metaSystemUserTokenValidatedAt || null,
      systemTokenInfo: state.metaSystemUserTokenInfo || null,
      instagramTokens: state.instagramTokens.map((t: any) => ({
        igUserId: t.igUserId,
        username: t.username,
        refreshedAt: t.refreshedAt,
        validatedAt: t.validatedAt,
        hasToken: !!t.token,
      })),
    };
  }
}
