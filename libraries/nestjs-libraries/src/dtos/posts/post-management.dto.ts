import { z } from 'zod';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const id = z.string().min(1).max(100);
const date = z.string().datetime({ offset: true });
export const managedMediaSchema = z
  .object({
    id,
    path: z.string().min(1).max(4096),
    alt: z.string().max(5000).optional(),
    thumbnail: z.string().url().max(4096).optional(),
  })
  .strict();
export const managedMessageSchema = z
  .object({
    id: id.optional(),
    content: z.string().max(100000),
    delay: z
      .number()
      .int()
      .min(0)
      .max(10080)
      .describe('Atraso em minutos entre comentarios/partes do thread')
      .optional(),
    media: z.array(managedMediaSchema).max(100),
  })
  .strict();
export const managedSettingsSchema = z
  .array(
    z
      .object({
        key: z.string().min(1).max(100),
        value: z
          .string()
          .max(65536)
          .describe(
            'Valor JSON serializado; para string simples pode usar texto cru.'
          ),
      })
      .strict()
  )
  .max(100);
export const managedTagsSchema = z
  .array(z.object({ value: id, label: z.string().max(200) }).strict())
  .max(100);
export const managedPostConfigurationSchema = z
  .object({
    date: date.optional(),
    messages: z.array(managedMessageSchema).min(1).max(100).optional(),
    settings: managedSettingsSchema.optional(),
    removeSettingKeys: z.array(z.string().min(1).max(100)).max(100).optional(),
    tags: managedTagsSchema.optional(),
    intervalInDays: z.number().int().min(1).max(3650).nullable().optional(),
    shortLink: z
      .boolean()
      .optional()
      .describe(
        'Transforma somente mensagens fornecidas; false não desfaz URLs já encurtadas.'
      ),
  })
  .strict();
export const managedPostPatchSchema = z
  .object({
    expectedVersion: z.string().min(1).max(100),
    configuration: managedPostConfigurationSchema,
    localOnly: z
      .boolean()
      .optional()
      .describe(
        'Obrigatório true para editar metadados de post publicado; não edita a rede remota.'
      ),
  })
  .strict();
export const managedPostActionSchema = z
  .object({
    operation: z.enum([
      'schedule',
      'cancel',
      'publish_now',
      'delete',
      'sync',
      'stop',
      'retry_publish',
    ]),
    expectedVersion: z.string().min(1).max(100),
    date: date.optional(),
    republish: z
      .boolean()
      .optional()
      .describe(
        'Intenção explícita de publicar novamente um post já publicado; somente schedule/publish_now.'
      ),
  })
  .strict();
export const managedPostListSchema = z
  .object({
    startDate: date.optional(),
    endDate: date.optional(),
    integrationId: id.optional(),
    state: z.enum(['QUEUE', 'PUBLISHED', 'ERROR', 'DRAFT']).optional(),
    cursor: id.optional(),
    limit: z.number().int().min(1).max(100).optional(),
    customer: id.optional(),
  })
  .strict();
export const managedPostOptionsSchema = z
  .object({
    resource: z.enum(['capabilities', 'tags', 'free_slot']),
    integrationId: id.optional(),
  })
  .strict();
export type ManagedPostConfiguration = z.infer<
  typeof managedPostConfigurationSchema
>;
export type ManagedPostList = z.infer<typeof managedPostListSchema>;
export type ManagedMessage = z.infer<typeof managedMessageSchema>;
export type PostScope = { organizationId: string; profileId: string };

/** Small converter for this concrete subset; HTTP docs and MCP derive from one contract. */
export function postInputOpenApi(schema: z.ZodTypeAny): SchemaObject {
  if (schema instanceof z.ZodOptional) return postInputOpenApi(schema.unwrap());
  if (schema instanceof z.ZodNullable)
    return { ...postInputOpenApi(schema.unwrap()), nullable: true };
  const description = schema.description
    ? { description: schema.description }
    : {};
  if (schema instanceof z.ZodObject) {
    const entries = Object.entries(schema.shape) as [string, z.ZodTypeAny][];
    return {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(
        entries.map(([key, field]) => [key, postInputOpenApi(field)])
      ),
      required: entries
        .filter(([, field]) => !field.isOptional())
        .map(([key]) => key),
      ...description,
    };
  }
  if (schema instanceof z.ZodArray)
    return {
      type: 'array',
      items: postInputOpenApi(schema.element),
      ...(schema._def.minLength
        ? { minItems: schema._def.minLength.value }
        : {}),
      ...(schema._def.maxLength
        ? { maxItems: schema._def.maxLength.value }
        : {}),
      ...description,
    };
  if (schema instanceof z.ZodEnum)
    return { type: 'string', enum: schema.options, ...description };
  if (schema instanceof z.ZodBoolean)
    return { type: 'boolean', ...description };
  if (schema instanceof z.ZodString) {
    const result: SchemaObject = { type: 'string', ...description };
    for (const check of schema._def.checks) {
      if (check.kind === 'min') result.minLength = check.value;
      if (check.kind === 'max') result.maxLength = check.value;
      if (check.kind === 'datetime') result.format = 'date-time';
      if (check.kind === 'url') result.format = 'uri';
    }
    return result;
  }
  if (schema instanceof z.ZodNumber) {
    const result: SchemaObject = { type: 'number', ...description };
    for (const check of schema._def.checks) {
      if (check.kind === 'int') result.type = 'integer';
      if (check.kind === 'min') result.minimum = check.value;
      if (check.kind === 'max') result.maximum = check.value;
    }
    return result;
  }
  throw new Error('UNSUPPORTED_POST_INPUT_SCHEMA');
}
