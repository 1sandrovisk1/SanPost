import {
  Body,
  Controller,
  Get,
  HttpException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Organization } from '@prisma/client';
import { z } from 'zod';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetPublicApiProfileId } from '@gitroom/nestjs-libraries/user/public.api.profile.from.request';
import { PostManagementService } from '@gitroom/nestjs-libraries/database/prisma/posts/post-management.service';
import {
  managedPostPatchSchema,
  managedPostActionSchema,
  managedPostListSchema,
  managedPostOptionsSchema,
  postInputOpenApi,
} from '@gitroom/nestjs-libraries/dtos/posts/post-management.dto';

function valid<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success)
    throw new HttpException('INVALID_POST_MANAGEMENT_INPUT', 400);
  return result.data;
}
@ApiTags('Posts e agendamentos para agentes')
@ApiSecurity('api-key')
@Controller('/public/v1/post-management')
export class PublicPostManagementController {
  constructor(private readonly service: PostManagementService) {}
  private scope(org: Organization, key?: string, requested?: string) {
    if (key && requested && key !== requested)
      throw new HttpException('PROFILE_KEY_MISMATCH', 403);
    return this.service.scope(org.id, key || requested);
  }
  @Get('/capabilities')
  @ApiOperation({
    summary: 'Campos, ações e limites reais do gerenciamento de posts',
  })
  async capabilities(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key?: string,
    @Query('profileId') profile?: string
  ) {
    await this.scope(org, key, profile);
    return this.service.capabilities();
  }
  @Get('/options')
  @ApiQuery({ name: 'resource', enum: ['capabilities', 'tags', 'free_slot'] })
  @ApiQuery({ name: 'integrationId', required: false })
  async options(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query() query: Record<string, string>
  ) {
    const { profileId, ...body } = query;
    return this.service.options(
      await this.scope(org, key, profileId),
      valid(managedPostOptionsSchema, body)
    );
  }
  @Get()
  @ApiQuery({ name: 'startDate', required: false, type: String })
  @ApiQuery({ name: 'endDate', required: false, type: String })
  @ApiQuery({ name: 'integrationId', required: false, type: String })
  @ApiQuery({ name: 'customer', required: false, type: String })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({
    name: 'state',
    required: false,
    enum: ['QUEUE', 'PUBLISHED', 'ERROR', 'DRAFT'],
  })
  @ApiOperation({
    summary: 'Listar posts por data/canal/estado, com cursor e limite até 100',
  })
  async list(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Query() query: Record<string, string>
  ) {
    const { profileId, ...body } = query;
    return this.service.list(
      await this.scope(org, key, profileId),
      valid(managedPostListSchema, {
        ...body,
        ...(body.limit !== undefined ? { limit: Number(body.limit) } : {}),
      })
    );
  }
  @Get('/:id')
  @ApiQuery({ name: 'includeDeleted', required: false, type: Boolean })
  @ApiOperation({ summary: 'Detalhar configuração e snapshot antes de editar' })
  async detail(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Param('id') id: string,
    @Query('profileId') profile?: string,
    @Query('includeDeleted') deleted?: string
  ) {
    if (deleted !== undefined && !['true', 'false'].includes(deleted))
      throw new HttpException('INVALID_INCLUDE_DELETED', 400);
    return this.service.detail(
      await this.scope(org, key, profile),
      id,
      deleted === 'true'
    );
  }
  @Put('/:id')
  @ApiBody({ schema: postInputOpenApi(managedPostPatchSchema) })
  @ApiOperation({
    summary: 'Editar parcialmente sem recriar o destino nem perder automações',
    description:
      'Consulte docs/api/posts-agent-api.md. messages informada substitui cadeia completa; settings é merge. expectedVersion obrigatório.',
  })
  @Throttle({ default: { limit: 60, ttl: 3600000 } })
  async update(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
    @Query('profileId') profile?: string
  ) {
    return this.service.update(
      await this.scope(org, key, profile),
      id,
      valid(managedPostPatchSchema, body)
    );
  }
  @Post('/:id/actions')
  @ApiBody({ schema: postInputOpenApi(managedPostActionSchema) })
  @ApiOperation({
    summary:
      'Reagendar, cancelar, publicar, excluir localmente ou recuperar sincronização',
    description:
      'Publicação real é explícita; publicados exigem republish=true. Cancelamento não desfaz envio remoto em andamento.',
  })
  @Throttle({ default: { limit: 60, ttl: 3600000 } })
  async action(
    @GetOrgFromRequest() org: Organization,
    @GetPublicApiProfileId() key: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
    @Query('profileId') profile?: string
  ) {
    return this.service.action(
      await this.scope(org, key, profile),
      id,
      valid(managedPostActionSchema, body)
    );
  }
}
