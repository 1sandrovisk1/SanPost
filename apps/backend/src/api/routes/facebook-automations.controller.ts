import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpException,
  Param,
  Post,
  Query,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { Organization, Profile, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { FacebookAutomationSetupService } from '@gitroom/nestjs-libraries/integrations/automations/facebook-automation-setup.service';
import { FacebookAutomationProofService } from '@gitroom/nestjs-libraries/integrations/automations/facebook-automation-proof.service';
import {
  CompleteFacebookAutomationDto,
  SendFacebookPrivateReplyTestDto,
} from '@gitroom/nestjs-libraries/dtos/integrations/facebook-automation.dto';
import { CheckPolicies } from '@gitroom/backend/services/auth/permissions/permissions.ability';
import {
  AuthorizationActions,
  Sections,
} from '@gitroom/backend/services/auth/permissions/permission.exception.class';

const context = (org: Organization, profile: Profile | null, user: User) => ({
  organizationId: org?.id,
  profileId: profile?.id || '',
  userId: user?.id,
});

@Controller('/facebook-automations')
export class FacebookAutomationsController {
  constructor(
    private readonly service: FacebookAutomationSetupService,
    private readonly proof: FacebookAutomationProofService
  ) {}

  @Get('/')
  @CheckPolicies([AuthorizationActions.Read, Sections.ADMIN])
  list(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @GetUserFromRequest() user: User
  ) {
    return this.service.list(context(org, profile, user));
  }

  @Get('/app/webhook')
  @Header('Cache-Control', 'no-store')
  @CheckPolicies([AuthorizationActions.Read, Sections.ADMIN])
  appWebhook(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @GetUserFromRequest() user: User
  ) {
    return this.service.viewWebhook(context(org, profile, user));
  }

  @Get('/:integrationId')
  @Header('Cache-Control', 'no-store')
  @CheckPolicies([AuthorizationActions.Read, Sections.ADMIN])
  view(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @GetUserFromRequest() user: User,
    @Param('integrationId') id: string
  ) {
    return this.service.view(context(org, profile, user), id);
  }

  @Get('/:integrationId/private-reply-test')
  @Header('Cache-Control', 'no-store')
  @CheckPolicies([AuthorizationActions.Read, Sections.ADMIN])
  previewPrivateReply(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @GetUserFromRequest() user: User,
    @Param('integrationId') id: string
  ) {
    return this.proof.view(context(org, profile, user), id);
  }

  @Post('/:integrationId/private-reply-test')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  sendPrivateReply(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @GetUserFromRequest() user: User,
    @Param('integrationId') id: string,
    @Body() body: SendFacebookPrivateReplyTestDto
  ) {
    return this.proof.send(context(org, profile, user), id, body);
  }

  @Post('/:integrationId/authorize')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  authorize(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @GetUserFromRequest() user: User,
    @Param('integrationId') id: string
  ) {
    return this.service.authorize(context(org, profile, user), id);
  }

  @Post('/:integrationId/system-user')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  useSystemUser(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @GetUserFromRequest() user: User,
    @Param('integrationId') id: string,
    @Headers('x-expected-org-id') expectedOrg: string | undefined,
    @Headers('x-expected-profile-id') expectedProfile: string | undefined
  ) {
    if (
      !expectedOrg ||
      !expectedProfile ||
      expectedOrg !== org?.id ||
      expectedProfile !== profile?.id
    )
      throw new HttpException('CREDENTIAL_SCOPE_CHANGED', 409);
    return this.service.useSystemUser(context(org, profile, user), id);
  }

  @Post('/complete')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  complete(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @GetUserFromRequest() user: User,
    @Body() body: CompleteFacebookAutomationDto
  ) {
    return this.service.complete(context(org, profile, user), body);
  }

  @Post('/:integrationId/check')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  check(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @GetUserFromRequest() user: User,
    @Param('integrationId') id: string
  ) {
    return this.service.check(context(org, profile, user), id);
  }

  @Post('/:integrationId/activate')
  @CheckPolicies([AuthorizationActions.Update, Sections.ADMIN])
  activate(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @GetUserFromRequest() user: User,
    @Param('integrationId') id: string
  ) {
    return this.service.activate(context(org, profile, user), id);
  }
}

@Controller('/public/facebook-automations')
export class FacebookAutomationsWebhookController {
  constructor(private readonly service: FacebookAutomationSetupService) {}

  @Get('/:appId')
  @Header('Content-Type', 'text/plain')
  @Header('Cache-Control', 'no-store')
  verify(
    @Param('appId') appId: string,
    @Query('hub.mode') mode: unknown,
    @Query('hub.verify_token') token: unknown,
    @Query('hub.challenge') challenge: unknown
  ) {
    return this.service.verify(appId, mode, token, challenge);
  }

  @Post('/:appId')
  @HttpCode(200)
  receive(
    @Param('appId') appId: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined
  ) {
    return this.service.receive(appId, req.rawBody, signature);
  }
}
