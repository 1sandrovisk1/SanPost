import {
  ApiProperty,
  ApiPropertyOptional,
  OmitType,
  PartialType,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { z } from 'zod';
import { QuickCreateFlowDto, SaveCanvasDto } from './flow.dto';
import { FlowChannelDto } from './flow-v2.dto';
import { RepostDestinationFormat, RepostSourceType } from '@prisma/client';

export class AutomationConfigurationDto extends OmitType(QuickCreateFlowDto, [
  'triggerType',
  'postIds',
  'storyIds',
  'expectedUpdatedAt',
] as const) {
  @ApiProperty({
    description:
      'ID interno do canal Instagram ou da Página Facebook no SanPost. Obtido em options?resource=channels.',
  })
  override integrationId: string;
  @ApiPropertyOptional({
    enum: ['instagram', 'facebook'],
    default: 'instagram',
  })
  @IsOptional()
  @IsIn(['instagram', 'facebook'])
  platform?: 'instagram' | 'facebook';
  @ApiPropertyOptional({
    enum: ['comment_on_post', 'story_reply', 'messenger_message'],
    default: 'comment_on_post',
  })
  @IsOptional()
  @IsIn(['comment_on_post', 'story_reply', 'messenger_message'])
  triggerType?: 'comment_on_post' | 'story_reply' | 'messenger_message';
  @ApiPropertyOptional({
    type: [String],
    description:
      'IDs remotos para publicações específicas, incluindo Dark Posts Facebook.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  postIds?: string[];
  @ApiPropertyOptional({
    type: [String],
    description: 'IDs de Stories Instagram para escopo específico.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  storyIds?: string[];
  @ApiPropertyOptional({
    type: [String],
    description:
      'Aliases numéricos de Dark Posts Instagram na criação; coexistem com postIds. Alterações posteriores usam a operação explícita aliases.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @Matches(/^\d{1,30}$/, { each: true })
  aliasMediaIds?: string[];
  @ApiPropertyOptional({
    minimum: 1,
    maximum: 1000,
    default: 10,
    description:
      'Somente Messenger: menor número vence. Regras correspondentes com prioridade igual são recusadas.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  priority?: number;
}
export class AutomationConfigurationPatchDto extends PartialType(
  AutomationConfigurationDto
) {}
export class AutomationUpdateDto {
  @ApiProperty({
    type: AutomationConfigurationPatchDto,
    description:
      'Edição parcial: campos omitidos são preservados. Grafos personalizados exigem a rota canvas.',
  })
  @ValidateNested()
  @Type(() => AutomationConfigurationPatchDto)
  configuration: AutomationConfigurationPatchDto;
  @ApiPropertyOptional({
    minimum: 1,
    description: 'Obrigatória no motor Facebook V2; obtida no detalhe.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;
  @ApiPropertyOptional({
    description:
      'Obrigatório no motor Instagram V1: updatedAt obtido no detalhe.',
  })
  @IsOptional()
  @IsDateString()
  expectedUpdatedAt?: string;
}
export class AutomationStatusDto {
  @ApiProperty({ enum: ['ACTIVE', 'PAUSED', 'ARCHIVED', 'DRAFT'] })
  @IsIn(['ACTIVE', 'PAUSED', 'ARCHIVED', 'DRAFT'])
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DRAFT';
  @ApiPropertyOptional({
    minimum: 1,
    description: 'Obrigatória para alteração de estado do Facebook V2.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;
}
export class AutomationCanvasDto extends SaveCanvasDto {
  @ApiPropertyOptional({
    description:
      'V1: updatedAt obtido no detalhe. Obrigatório para edição atômica.',
  })
  override expectedUpdatedAt?: string;
  @ApiPropertyOptional({
    minimum: 1,
    description: 'Obrigatória no Facebook V2.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedRevision?: number;
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @Matches(/\S/)
  @MaxLength(200)
  override name?: string;
  @ApiPropertyOptional({
    type: [FlowChannelDto],
    description: 'Somente V2. Omitir preserva canais e alvos existentes.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => FlowChannelDto)
  channels?: FlowChannelDto[];
}
const text = (max: number) => z.string().max(max);
const ids = (max = 100) => z.array(text(max)).max(100);
/** Concrete object schema shared by MCP create/update; domain validates semantic combinations too. */
export const automationConfigurationShape = {
  platform: z
    .enum(['instagram', 'facebook'])
    .optional()
    .describe(
      'Rede. Padrão instagram. Messenger é um gatilho da Página Facebook.'
    ),
  name: text(200).min(1),
  integrationId: text(64).min(1),
  triggerType: z
    .enum(['comment_on_post', 'story_reply', 'messenger_message'])
    .optional(),
  postMode: z
    .enum(['all', 'specific', 'next_publication', 'scheduled'])
    .optional()
    .describe(
      'Para agendados SanPost use scheduled e o Post.id interno. Messenger só all.'
    ),
  postIds: ids().optional(),
  storyIds: ids(64).optional(),
  scheduledPostId: text(80).optional(),
  aliasMediaIds: z
    .array(z.string().regex(/^\d{1,30}$/))
    .max(100)
    .optional()
    .describe(
      'Aliases de Dark Posts Instagram. Facebook usa resolver-publicação e postIds.'
    ),
  keywords: z.array(text(100)).max(50).optional(),
  matchMode: z.enum(['any', 'all', 'exact']).optional(),
  matchReactions: z
    .boolean()
    .optional()
    .describe('Somente resposta ao Story Instagram.'),
  priority: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('Somente Messenger. Menor número vence; padrão 10.'),
  replyMessage: text(2200).optional(),
  replyMessages: z.array(text(2200)).max(10).optional(),
  dmMessage: text(2000).optional(),
  dmVariants: z
    .array(
      z
        .object({
          message: text(2000).min(1),
          buttonText: text(20).min(1).optional(),
          buttonUrl: text(2000).optional(),
        })
        .strict()
    )
    .min(1)
    .max(10)
    .optional(),
  dmMessages: z
    .array(
      text(2000)
        .min(1)
        .refine((value) => !!value.trim(), 'EMPTY_PRIVATE_VARIATION')
    )
    .min(1)
    .max(10)
    .optional(),
  dmButtonText: text(80).optional(),
  dmButtonUrl: text(2048).optional(),
  requireFollow: z.boolean().optional(),
  followGateMessage: text(2000).optional(),
  openingDmMessage: text(2000).optional(),
  openingDmButtonText: text(80).optional(),
  alreadyFollowedButtonText: text(80).optional(),
  gateExhaustedMessage: text(2000).optional(),
  maxGateAttempts: z.number().int().min(1).max(10).optional(),
  activate: z
    .boolean()
    .optional()
    .describe(
      'Criação: false salva rascunho. Edição: omitido preserva status; use ferramenta de status para ativar/pausar.'
    ),
};
export const automationConfigurationSchema = z
  .object(automationConfigurationShape)
  .strict();
export type AutomationConfiguration = z.infer<
  typeof automationConfigurationSchema
>;
export const automationCanvasSchema = z
  .object({
    nodes: z
      .array(
        z
          .object({
            id: z.string(),
            type: z.enum([
              'TRIGGER',
              'CONDITION',
              'REPLY_COMMENT',
              'SEND_DM',
              'DELAY',
            ]),
            label: z.string().optional(),
            data: z
              .string()
              .describe(
                'JSON de configuração do nó; consulte capabilities para campos por tipo.'
              ),
            positionX: z.number(),
            positionY: z.number(),
          })
          .strict()
      )
      .max(100),
    edges: z
      .array(
        z
          .object({
            id: z.string().optional(),
            sourceNodeId: z.string(),
            targetNodeId: z.string(),
            sourceHandle: z.string().optional(),
          })
          .strict()
      )
      .max(200),
    name: text(200).trim().min(1).optional(),
    expectedRevision: z.number().int().min(1).optional(),
    expectedUpdatedAt: z.string().datetime().optional(),
    channels: z
      .array(
        z
          .object({
            integrationId: text(80),
            postMode: z.enum([
              'all',
              'specific',
              'next_publication',
              'scheduled',
            ]),
            postIds: ids(),
            scheduledPostId: text(80).optional(),
          })
          .strict()
      )
      .max(2)
      .optional(),
  })
  .strict();
export const automationOptionsSchema = z
  .object({
    resource: z.enum([
      'capabilities',
      'channels',
      'posts',
      'stories',
      'scheduled_posts',
      'resolve_post',
      'readiness',
    ]),
    platform: z.enum(['instagram', 'facebook']).optional(),
    integrationId: text(80).optional(),
    triggerType: z
      .enum(['comment_on_post', 'story_reply', 'messenger_message'])
      .optional(),
    cursor: text(2048).optional(),
    selectedId: text(80).optional(),
    reference: text(2048).optional(),
  })
  .strict();
export const automationAliasesSchema = z
  .object({
    operation: z.enum(['list', 'add', 'remove']),
    aliasMediaId: z
      .string()
      .regex(/^\d{1,30}$/)
      .optional(),
    aliasId: text(80).optional(),
  })
  .strict();
export const repostConfigurationSchema = z
  .object({
    name: text(120).min(1),
    sourceIntegrationId: text(80),
    sourceType: z.nativeEnum(RepostSourceType),
    destinations: z
      .array(
        z
          .object({
            integrationId: text(80),
            format: z.nativeEnum(RepostDestinationFormat),
          })
          .strict()
      )
      .min(1)
      .max(50),
    intervalMinutes: z.number().int().min(5).max(360).optional(),
    filterIncludeVideos: z.boolean().optional(),
    filterIncludeImages: z.boolean().optional(),
    filterMaxDurationSeconds: z
      .number()
      .int()
      .min(1)
      .max(900)
      .nullable()
      .optional(),
    filterHashtag: text(100).nullable().optional(),
    captionTemplate: text(2200).nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();
export const repostRequestSchema = z
  .object({
    operation: z.enum([
      'sources',
      'destinations',
      'list',
      'get',
      'create',
      'update',
      'toggle',
      'archive',
      'history',
      'run_now',
      'reset_checkpoint',
    ]),
    ruleId: text(80).optional(),
    configuration: repostConfigurationSchema.partial().optional(),
    sourceType: z.nativeEnum(RepostSourceType).optional(),
    enabled: z.boolean().optional(),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict();
