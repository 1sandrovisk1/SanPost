import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Param,
  Query,
  HttpException,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiTags, ApiSecurity, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { Organization } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetPublicApiProfileId } from '@gitroom/nestjs-libraries/user/public.api.profile.from.request';
import { SharedFlowsService } from '@gitroom/nestjs-libraries/database/prisma/flows-v2/shared-flows.service';
import { ScheduledPostsService } from '@gitroom/nestjs-libraries/database/prisma/scheduled-automations/scheduled-posts.service';
import {
  SaveFlowV2Dto,
  FlowV2StatusDto,
} from '@gitroom/nestjs-libraries/dtos/flows/flow-v2.dto';
@ApiTags('Automações V2')
@ApiSecurity('api-key')
@Controller('/public/v1/flows-v2')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  })
)
export class PublicSharedFlowsController {
  constructor(
    private readonly service: SharedFlowsService,
    private readonly scheduled: ScheduledPostsService
  ) {}
  private scope(org: Organization, keyProfile?: string, requested?: string) {
    if (keyProfile && requested && keyProfile !== requested)
      throw new HttpException('PROFILE_KEY_MISMATCH', 403);
    const profileId = keyProfile || requested;
    if (!profileId) throw new HttpException('PROFILE_REQUIRED', 400);
    return { organizationId: org.id, profileId };
  }
  @Get('/scheduled-posts/:integrationId')
  @ApiOperation({ summary: 'Listar posts agendados do canal para automação' })
  listPosts(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile: string | undefined,
    @Param('integrationId') id: string,
    @Query('cursor') cursor?: string,
    @Query('selectedId') selectedId?: string
  ) {
    return this.scheduled.list(
      this.scope(org, key, profile),
      id,
      cursor,
      selectedId
    );
  }
  @Get() list(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile?: string
  ) {
    return this.service.list(this.scope(org, key, profile));
  }
  @Post()
  @ApiOperation({
    summary: 'Criar rascunho de automação Facebook V2, incluindo post agendado',
  })
  @ApiQuery({ name: 'profileId', required: false })
  create(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile: string | undefined,
    @Body() body: SaveFlowV2Dto
  ) {
    return this.service.save(this.scope(org, key, profile), body);
  }
  @Get('/:id') get(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile: string | undefined,
    @Param('id') id: string
  ) {
    return this.service.get(this.scope(org, key, profile), id);
  }
  @Put('/:id') update(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile: string | undefined,
    @Param('id') id: string,
    @Body() body: SaveFlowV2Dto
  ) {
    return this.service.save(this.scope(org, key, profile), body, id);
  }
  @Post('/:id/status') status(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query('profileId') profile: string | undefined,
    @Param('id') id: string,
    @Body() body: FlowV2StatusDto
  ) {
    return this.service.status(
      this.scope(org, key, profile),
      id,
      body.expectedRevision,
      body.status
    );
  }
}
