import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import { Organization, Profile } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetProfileFromRequest } from '@gitroom/nestjs-libraries/user/profile.from.request';
import { SharedFlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows-v2/shared-flows.service';
import {
  SaveFlowV2Dto,
  FlowV2StatusDto,
  FlowV2RevisionDto,
  ResolveAutomationPostDto,
} from '@gitroom/nestjs-libraries/dtos/flows/flow-v2.dto';
const scope = (org: Organization, profile: Profile | null) => ({
  organizationId: org?.id,
  profileId: profile?.id || '',
});
@Controller('/flows-v2')
export class FlowsV2Controller {
  constructor(private readonly service: SharedFlowsService) {}
  @Get() @Header('Cache-Control', 'no-store') list(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    return this.service.list(scope(org, profile));
  }
  @Get('/channels') channels(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null
  ) {
    return this.service.listChannels(scope(org, profile));
  }
  @Get('/channels/:id/posts') posts(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Query('cursor') cursor?: string
  ) {
    return this.service.posts(scope(org, profile), id, cursor);
  }
  @Get('/channels/:id/readiness')
  @Header('Cache-Control', 'no-store')
  readiness(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Query('triggerType') triggerType?: string
  ) {
    return this.service.readiness(scope(org, profile), id, triggerType);
  }
  @Post('/channels/:id/resolve-post')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  resolvePost(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    )
    body: ResolveAutomationPostDto
  ) {
    return this.service.resolvePost(scope(org, profile), id, body.reference);
  }
  @Post('/channels/:id/activate-messenger') activateMessenger(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this.service.activateMessenger(scope(org, profile), id);
  }
  @Post() create(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Body() body: SaveFlowV2Dto
  ) {
    return this.service.save(scope(org, profile), body);
  }
  @Get('/:id') @Header('Cache-Control', 'no-store') get(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this.service.get(scope(org, profile), id);
  }
  @Put('/:id') save(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: SaveFlowV2Dto
  ) {
    return this.service.save(scope(org, profile), body, id);
  }
  @Post('/:id/status') status(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: FlowV2StatusDto
  ) {
    return this.service.status(
      scope(org, profile),
      id,
      body.expectedRevision,
      body.status
    );
  }
  @Delete('/:id') remove(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string,
    @Body() body: FlowV2RevisionDto
  ) {
    return this.service.status(
      scope(org, profile),
      id,
      body.expectedRevision,
      'ARCHIVED'
    );
  }
  @Get('/:id/executions') history(
    @GetOrgFromRequest() org: Organization,
    @GetProfileFromRequest() profile: Profile | null,
    @Param('id') id: string
  ) {
    return this.service.history(scope(org, profile), id);
  }
}
