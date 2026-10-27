import { HttpException, Injectable } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { CredentialService } from '../../database/prisma/credentials/credential.service';
import type { FacebookAuthorization } from '../../dtos/integrations/facebook-automation.dto';
import { FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS } from './facebook-comment-automation.adapter';
import {
  MetaAutomationError,
  MetaAutomationGraphClient,
  record,
} from './meta-automation-graph.client';

class SystemUserValidationError extends HttpException {}

export const FACEBOOK_SYSTEM_USER_PERMISSIONS = [
  ...FACEBOOK_COMMENT_AUTOMATION_PERMISSIONS,
  'pages_manage_engagement',
] as const;

type Scope = { organizationId: string; profileId: string };
type App = { client_id: string; client_secret: string };

/** Explicit Page authorization only. Never inherits publishing credentials or changes assets. */
@Injectable()
export class FacebookSystemUserService {
  constructor(
    private readonly credentials: CredentialService,
    private readonly graph: MetaAutomationGraphClient
  ) {}

  private fail(message: string): never {
    throw new SystemUserValidationError({ message }, 412);
  }

  private async token(scope: Scope) {
    if (!scope.organizationId || !scope.profileId)
      throw new HttpException('PROFILE_REQUIRED', 403);
    const raw = await this.credentials.getRaw(
      scope.organizationId,
      'facebook',
      scope.profileId
    );
    return typeof raw?.metaSystemUserToken === 'string'
      ? raw.metaSystemUserToken.trim()
      : '';
  }

  private fingerprint(scope: Scope, app: App, token: string) {
    return createHmac('sha256', app.client_secret)
      .update(
        JSON.stringify([
          scope.organizationId,
          scope.profileId,
          app.client_id,
          token,
        ])
      )
      .digest('hex');
  }

  async available(scope: Scope) {
    return !!(await this.token(scope));
  }

  async assertUnchanged(scope: Scope, app: App, fingerprint: string) {
    const token = await this.token(scope);
    if (!token || this.fingerprint(scope, app, token) !== fingerprint)
      throw new HttpException('AUTHORIZATION_CHANGED', 409);
  }

  private expiry(value: unknown, required: boolean): string | null | undefined {
    if (value === undefined) {
      if (required) this.fail('SYSTEM_USER_EXPIRY_UNKNOWN');
      return undefined;
    }
    if (
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > 8640000000000
    )
      this.fail('SYSTEM_USER_TOKEN_INVALID');
    if (value === 0) return null;
    if (value * 1000 <= Date.now()) this.fail('SYSTEM_USER_TOKEN_EXPIRED');
    return new Date(value * 1000).toISOString();
  }

  async derive(scope: Scope, pageId: string, app: App) {
    const sourceToken = await this.token(scope);
    if (!sourceToken) this.fail('SYSTEM_USER_TOKEN_REQUIRED');
    if (!/^\d{1,32}$/.test(pageId)) this.fail('SYSTEM_USER_PAGE_DENIED');
    try {
      const debug = record(
        (
          await this.graph.read(
            'debug_token',
            `${app.client_id}|${app.client_secret}`,
            { input_token: sourceToken }
          )
        ).data
      );
      if (debug.is_valid !== true) this.fail('SYSTEM_USER_TOKEN_INVALID');
      if (debug.type !== 'SYSTEM_USER') this.fail('SYSTEM_USER_TYPE_REQUIRED');
      if (debug.app_id !== app.client_id) this.fail('SYSTEM_USER_APP_MISMATCH');
      if (
        typeof debug.user_id !== 'string' ||
        !/^\d{1,32}$/.test(debug.user_id)
      )
        this.fail('SYSTEM_USER_TOKEN_INVALID');
      const tokenExpiresAt = this.expiry(debug.expires_at, true);
      const dataAccessExpiresAt = this.expiry(
        debug.data_access_expires_at,
        false
      );
      if (
        FACEBOOK_SYSTEM_USER_PERMISSIONS.some(
          (permission) =>
            !Array.isArray(debug.scopes) || !debug.scopes.includes(permission)
        )
      )
        this.fail('SYSTEM_USER_PERMISSIONS_MISSING');
      for (const item of Array.isArray(debug.granular_scopes)
        ? debug.granular_scopes
        : []) {
        const grant = record(item);
        if (
          FACEBOOK_SYSTEM_USER_PERMISSIONS.includes(grant.scope as any) &&
          Array.isArray(grant.target_ids) &&
          !grant.target_ids.includes(pageId)
        )
          this.fail('SYSTEM_USER_PAGE_DENIED');
      }
      const page = await this.graph.read(pageId, sourceToken, {
        fields: 'id,access_token',
      });
      if (
        page.id !== pageId ||
        typeof page.access_token !== 'string' ||
        !page.access_token.trim()
      )
        this.fail('SYSTEM_USER_PAGE_DENIED');
      const authorization: FacebookAuthorization = {
        source: 'SYSTEM_USER',
        systemUserId: debug.user_id,
        authorizedAt: new Date().toISOString(),
        tokenExpiresAt,
        dataAccessExpiresAt,
        noScheduledExpiry: debug.expires_at === 0,
      };
      return {
        pageToken: page.access_token,
        authorization,
        sourceFingerprint: this.fingerprint(scope, app, sourceToken),
      };
    } catch (error) {
      // Only our own fixed codes may leave the service. Never expose provider bodies or URLs.
      if (error instanceof SystemUserValidationError) throw error;
      if (
        error instanceof MetaAutomationError &&
        error.category === 'APP_MISMATCH'
      )
        this.fail('SYSTEM_USER_APP_MISMATCH');
      this.fail('SYSTEM_USER_CHECK_FAILED');
    }
  }
}
