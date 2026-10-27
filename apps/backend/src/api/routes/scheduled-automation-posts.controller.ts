import { Controller, Get, Param, Query, Header } from '@nestjs/common';
import { Organization, Profile } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { ScheduledPostsService } from '@gitroom/nestjs-libraries/database/prisma/scheduled-automations/scheduled-posts.service';
@Controller('/automation-scheduled-posts')
export class ScheduledAutomationPostsController {
  constructor(private readonly service: ScheduledPostsService) {}
  @Get('/:integrationId')
  @Header('Cache-Control', 'no-store')
  list(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('integrationId') integrationId: string,
    @Query('cursor') cursor?: string,
    @Query('selectedId') selectedId?: string
  ) {
    return this.service.list(
      { organizationId: org.id, profileId: profile?.id || '' },
      integrationId,
      cursor,
      selectedId
    );
  }
}
