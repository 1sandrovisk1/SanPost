import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { CommentDefinition } from '../../database/prisma/flows-v2/flow-definition';
import { ApiProperty, ApiPropertyOptional, PickType } from '@nestjs/swagger';
import { SaveCanvasDto } from './flow.dto';
class CommentDefinitionDto extends PickType(SaveCanvasDto, ['nodes', 'edges'] as const) {}
export interface FlowScope {
  organizationId: string;
  profileId: string;
}
export class FlowChannelDto {
  @ApiProperty()
  @IsString() @MaxLength(80) integrationId: string;
  @ApiProperty({ enum: ['specific','all','next_publication','scheduled'] })
  @IsIn(['specific', 'all', 'next_publication', 'scheduled']) postMode:
    | 'specific'
    | 'all'
    | 'next_publication'
    | 'scheduled';
  @ApiPropertyOptional({ description: 'Post.id interno de um agendamento MultiPost.' })
  @IsOptional() @IsString() @MaxLength(80) scheduledPostId?: string;
  @ApiProperty({ type: [String], maxItems: 100 })
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  postIds: string[];
}
export class SaveFlowV2Dto {
  @ApiProperty({ maxLength: 200 })
  @IsString() @MaxLength(200) name: string;
  @ApiProperty({ type: [FlowChannelDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => FlowChannelDto)
  channels: FlowChannelDto[];
  @ApiProperty({ type: CommentDefinitionDto })
  @IsObject() definition: CommentDefinition;
  @ApiPropertyOptional({ description: 'Revisão retornada no detalhe; obrigatória na edição.' })
  @IsOptional() @IsInt() @Min(1) expectedRevision?: number;
}
export class FlowV2StatusDto {
  @IsIn(['ACTIVE', 'PAUSED']) status: 'ACTIVE' | 'PAUSED';
  @IsInt() @Min(1) expectedRevision: number;
}
export class FlowV2RevisionDto {
  @IsInt() @Min(1) expectedRevision: number;
}
export interface CommentEvent extends FlowScope {
  eventType?: 'comment_on_post' | 'messenger_message';
  integrationId: string;
  platform: 'facebook' | 'instagram';
  remoteAccountId: string;
  externalEventId: string;
  externalPostId: string;
  externalActorId: string;
  actorName?: string;
  text: string;
  occurredAt: number;
}
export interface SharedFlowView {
  id: string;
  name: string;
  status: string;
  revision: number;
  executionVersion: number;
  definition: CommentDefinition;
  channels: Array<
    FlowChannelDto & {
      id: string;
      platform: string;
      remoteAccountId: string;
      name: string;
      boundPostId?: string | null;
    }
  >;
}
export interface AutomationChannelView {
  id: string;
  name: string;
  internalId: string;
  providerIdentifier: string;
  picture?: string | null;
}
export interface AutomationPostView {
  id: string;
  /** Present only when Meta confirms the publication state. Display-only metadata. */
  isPublished?: boolean;
  caption?: string;
  permalink?: string;
  thumbnailUrl?: string;
  timestamp?: string;
}
export class ResolveAutomationPostDto {
  @IsString() @MinLength(1) @MaxLength(2048) reference: string;
}
export interface ResolveAutomationPostView {
  post: AutomationPostView;
}
export interface AutomationReadiness {
  ready: boolean;
  reason?: string;
  checkedAt: string;
  tokenExpiresAt?: string | null;
  dataAccessExpiresAt?: string | null;
  noScheduledExpiry?: boolean;
}
