import { AgentToolInterface } from '../agent.tool.interface';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { Injectable } from '@nestjs/common';
import { socialIntegrationList } from '../../integrations/integration.manager';
import { IntegrationService } from '../../database/prisma/integrations/integration.service';
import { PostsService } from '../../database/prisma/posts/posts.service';
import { PostManagementService } from '../../database/prisma/posts/post-management.service';
import { makeId } from '../../services/make.is';
import { checkAuth } from '../auth.context';
import { readRequestContext } from './tool.context.helper';
import { automationErrorCode } from '../../integrations/automations/automation-management.service';
import {
  managedMediaSchema,
  managedSettingsSchema,
  managedTagsSchema,
} from '../../dtos/posts/post-management.dto';
import { CreatePostDto } from '../../dtos/posts/create.post.dto';
import { HttpException } from '@nestjs/common';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { weightedLength } from '@gitroom/helpers/utils/count.length';
import {
  isAllowedMediaPath,
  isRemoteMediaPath,
} from '../../database/prisma/posts/media.path.guard';
import { checkPublicHttpsUrl } from '../../dtos/validators/is-public-https-url.validator';

const fail = (code: string): never => {
  throw new HttpException(code, 400);
};
const parseValue = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};
export const schedulePostInputSchema = z
  .object({
    socialPost: z
      .array(
        z
          .object({
            integrationId: z.string().min(1).max(100),
            isPremium: z.boolean(),
            date: z.string().datetime({ offset: true }),
            shortLink: z.boolean(),
            type: z.enum(['draft', 'schedule', 'now']),
            tags: managedTagsSchema.optional(),
            intervalInDays: z
              .number()
              .int()
              .min(1)
              .max(3650)
              .nullable()
              .optional(),
            postsAndComments: z
              .array(
                z
                  .object({
                    content: z.string().max(100000),
                    attachments: z
                      .array(z.string().max(4096))
                      .max(100)
                      .optional(),
                    media: z.array(managedMediaSchema).max(100).optional(),
                    delay: z.number().int().min(0).max(10080).optional(),
                  })
                  .strict()
              )
              .min(1)
              .max(100),
            settings: managedSettingsSchema,
          })
          .strict()
      )
      .min(1)
      .max(100),
  })
  .strict();

@Injectable()
export class IntegrationSchedulePostTool implements AgentToolInterface {
  constructor(
    private readonly posts: PostsService,
    private readonly integrations: IntegrationService,
    private readonly management: PostManagementService
  ) {}
  name = 'integrationSchedulePostTool';
  run() {
    return createTool({
      id: 'schedulePostTool',
      description:
        'Cria novos posts/agendamentos/rascunhos. Consulte integrationSchema para regras e settings do provider. Suporta lote, tags, intervalo recorrente, comentários/threads com delay, attachments antigos ou media com id/path/alt/thumbnail. Primeiro item de postsAndComments é a publicação, os demais são comentários/partes do thread conforme a rede. Para editar/reagendar um post existente use getPostTool/updatePostTool/managePostScheduleTool, mantendo o ID. Se retornar saved=true, preserve os IDs retornados e não repita o lote inteiro. outcomeUnknown=true exige consultar uncertainPosts antes de qualquer nova criação. Publicar agora ou agendar deve seguir a intenção autorizada do usuário.',
      inputSchema: schedulePostInputSchema,
      outputSchema: z.object({
        output: z
          .array(z.object({ postId: z.string(), integration: z.string() }))
          .optional(),
        errors: z.string().optional(),
        saved: z.boolean().optional(),
        outcomeUnknown: z.boolean().optional(),
        uncertainPosts: z
          .array(z.object({ postId: z.string(), integration: z.string() }))
          .optional(),
      }),
      execute: async (raw: unknown, options: unknown) => {
        const output: Array<{ postId: string; integration: string }> = [];
        let uncertainPosts: Array<{ postId: string; integration: string }> = [];
        try {
          checkAuth(raw, options);
          const input = schedulePostInputSchema.safeParse(raw);
          if (!input.success) fail('INVALID_POST_INPUT');
          const context = readRequestContext(options);
          const org = JSON.parse(
            String(context.get('organization') || 'null')
          ) as { id?: string };
          if (!org?.id) fail('ORGANIZATION_REQUIRED');
          const profileId = context.get('profileId') as string | undefined;
          const ready: CreatePostDto[] = [];
          // Validate the whole batch before the first write, including native provider settings.
          for (const post of input.data.socialPost) {
            const integration = await this.integrations.getIntegrationById(
              org.id,
              post.integrationId
            );
            if (!integration || integration.deletedAt || integration.disabled)
              fail('CHANNEL_UNAVAILABLE');
            if (profileId && integration.profileId !== profileId)
              fail('CHANNEL_PROFILE_MISMATCH');
            const provider = socialIntegrationList.find(
              (p) => p.identifier === integration.providerIdentifier
            );
            if (!provider) fail('UNSUPPORTED_PROVIDER');
            const settings: Record<string, unknown> = {
              __type: integration.providerIdentifier,
            };
            const keys = new Set<string>();
            for (const field of post.settings) {
              if (
                ['__type', '__proto__', 'prototype', 'constructor'].includes(
                  field.key
                ) ||
                keys.has(field.key)
              )
                fail('POST_SETTING_KEY_INVALID');
              keys.add(field.key);
              settings[field.key] = parseValue(field.value);
            }
            if (post.tags?.length) {
              const scope = await this.management.scope(
                org.id,
                profileId || integration.profileId || undefined
              );
              const available = (await this.management.options(scope, {
                resource: 'tags',
              })) as Array<{ id: string; name: string }>;
              if (
                post.tags.some(
                  (tag) =>
                    !available.some(
                      (t) => t.id === tag.value && t.name === tag.label
                    )
                )
              )
                fail('POST_TAG_NOT_FOUND');
            }
            const value = post.postsAndComments.map((message) => {
              if (message.attachments?.length && message.media?.length)
                fail('AMBIGUOUS_POST_MEDIA');
              const images =
                message.media ||
                (message.attachments || []).map((path) => ({
                  id: makeId(10),
                  path,
                }));
              for (const item of images)
                if (
                  !isAllowedMediaPath(item.path) ||
                  (isRemoteMediaPath(item.path) &&
                    checkPublicHttpsUrl(item.path)) ||
                  ('thumbnail' in item &&
                    item.thumbnail &&
                    checkPublicHttpsUrl(String(item.thumbnail)))
                )
                  fail('POST_MEDIA_PATH_INVALID');
              const content = stripHtmlValidation(
                'normal',
                message.content,
                true
              );
              const length =
                provider.identifier === 'x'
                  ? weightedLength(content)
                  : content.length;
              if (length > (provider.maxLength(post.isPremium) || 1000000))
                fail('POST_CONTENT_TOO_LONG');
              return {
                id: makeId(10),
                content: message.content,
                delay: message.delay || 0,
                image: images,
              };
            });
            const body = {
              date: post.date,
              type: post.type,
              shortLink: post.shortLink,
              tags: post.tags || [],
              ...(post.intervalInDays != null
                ? { inter: post.intervalInDays }
                : {}),
              posts: [
                {
                  integration: { id: post.integrationId },
                  group: makeId(10),
                  settings,
                  value,
                },
              ],
            } as CreatePostDto;
            const validated = await this.posts.mapTypeToPost(body, org.id);
            validated.type = post.type;
            ready.push(validated);
          }
          for (const body of ready) {
            uncertainPosts = body.posts.map((post) => ({
              postId: post.value[0].id,
              integration: post.integration.id,
            }));
            output.push(
              ...(await this.posts.createPost(org.id, body, profileId))
            );
            uncertainPosts = [];
          }
          return { output };
        } catch (error) {
          return {
            ...(output.length ? { output, saved: true } : {}),
            ...(uncertainPosts.length
              ? { uncertainPosts, outcomeUnknown: true }
              : {}),
            errors: JSON.stringify([{ error: automationErrorCode(error) }]),
          };
        }
      },
    });
  }
}
