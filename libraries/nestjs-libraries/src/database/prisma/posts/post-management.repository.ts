import { HttpException, Injectable } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Prisma, State } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type {
  ManagedMessage,
  ManagedPostList,
  PostScope,
} from '../../../dtos/posts/post-management.dto';

const include = {
  integration: {
    select: {
      id: true,
      name: true,
      providerIdentifier: true,
      picture: true,
      additionalSettings: true,
      disabled: true,
      deletedAt: true,
      profileId: true,
    },
  },
  // tag excluida (soft delete) nao aparece no post (upstream #1827)
  tags: {
    where: { tag: { deletedAt: null as null } },
    select: { tag: { select: { id: true, name: true, color: true } } },
  },
} satisfies Prisma.PostInclude;
export type ManagedPostRow = Prisma.PostGetPayload<{ include: typeof include }>;
export type ManagedPostSnapshot = { rows: ManagedPostRow[]; version: string };
export interface ManagedPostWrite {
  messages?: ManagedMessage[];
  date?: string;
  settings?: Record<string, unknown>;
  tagIds?: string[];
  intervalInDays?: number | null;
  state?: State;
  resetRelease?: boolean;
  allowPublicationWindow?: boolean;
  deleted?: boolean;
}
export const postError = (message: string, status = 400): never => {
  throw new HttpException(message, status);
};
export function guardPostWindow(
  row: Pick<ManagedPostRow, 'state' | 'publishDate'>
) {
  if (row.state === 'QUEUE' && row.publishDate.getTime() <= Date.now() + 60000)
    postError('POST_PUBLICATION_WINDOW', 409);
}
export function managedPostVersion(rows: ManagedPostRow[]): string {
  return createHash('sha256')
    .update(
      JSON.stringify(
        // batchId fica fora: a coluna nova nao muda a versao de quem ja a
        // tinha (409 em todos os agentes depois do deploy)
        rows.map(({ integration, tags, batchId: _batch, ...post }) => ({
          ...post,
          tags: tags.map((t) => t.tag.id).sort(),
        }))
      )
    )
    .digest('hex');
}
@Injectable()
export class PostManagementRepository {
  constructor(private readonly db: PrismaService) {}
  /** Hold a separate advisory transaction until the committed write and its Temporal sync finish. */
  lock<T>(
    scope: PostScope,
    id: string,
    operation: (assertLease: () => Promise<void>) => Promise<T>
  ): Promise<T> {
    return this.db.$transaction(
      async (tx) => {
        const acquiredAt = Date.now();
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`post-management:${scope.organizationId}:${id}`}, 0))`;
        const assertLease = async () => {
          if (Date.now() - acquiredAt > 25000)
            postError('POST_OPERATION_LEASE_EXPIRED', 409);
          await tx.$queryRaw`SELECT 1 AS lease`;
        };
        return operation(assertLease);
      },
      { maxWait: 5000, timeout: 45000 }
    );
  }
  async detail(
    scope: PostScope,
    id: string,
    client: Prisma.TransactionClient = this.db,
    includeDeleted = false
  ): Promise<ManagedPostSnapshot> {
    const root = await client.post.findFirst({
      where: {
        id,
        ...scope,
        ...(includeDeleted ? {} : { deletedAt: null }),
        parentPostId: null,
      },
      include,
    });
    if (!root) postError('POST_NOT_FOUND', 404);
    if (root.integration.profileId !== scope.profileId)
      postError('POST_CHANNEL_SCOPE_CHANGED', 409);
    const all = await client.post.findMany({
      where: {
        ...scope,
        group: root.group,
        integrationId: root.integrationId,
        deletedAt: root.deletedAt,
      },
      include,
    });
    const rows = [root];
    while (true) {
      const children = all.filter(
        (p) => p.parentPostId === rows[rows.length - 1].id
      );
      if (!children.length) break;
      if (children.length !== 1 || rows.some((p) => p.id === children[0].id))
        postError('POST_CHAIN_AMBIGUOUS', 409);
      rows.push(children[0]);
    }
    if (rows.length !== all.length) postError('POST_CHAIN_AMBIGUOUS', 409);
    return { rows, version: managedPostVersion(rows) };
  }
  async list(scope: PostScope, q: ManagedPostList) {
    const posts = await this.db.post.findMany({
      where: {
        ...scope,
        deletedAt: null,
        parentPostId: null,
        ...(q.integrationId ? { integrationId: q.integrationId } : {}),
        ...(q.state ? { state: q.state } : {}),
        ...(q.startDate || q.endDate
          ? {
              publishDate: {
                ...(q.startDate ? { gte: new Date(q.startDate) } : {}),
                ...(q.endDate ? { lte: new Date(q.endDate) } : {}),
              },
            }
          : {}),
        integration: {
          profileId: scope.profileId,
          ...(q.customer ? { customerId: q.customer } : {}),
        },
      },
      include,
      orderBy: { id: 'asc' },
      take: (q.limit || 20) + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const limit = q.limit || 20;
    return {
      rows: posts.slice(0, limit),
      nextCursor: posts.length > limit ? posts[limit - 1].id : null,
    };
  }
  tags(scope: PostScope) {
    return this.db.tags.findMany({
      where: {
        orgId: scope.organizationId,
        profileId: scope.profileId,
        deletedAt: null,
      },
      select: { id: true, name: true, color: true },
      orderBy: { name: 'asc' },
    });
  }
  channel(scope: PostScope, id: string) {
    return this.db.integration.findFirst({
      where: { ...scope, id, deletedAt: null },
      select: include.integration.select,
    });
  }
  async write(
    scope: PostScope,
    id: string,
    expectedVersion: string,
    change: ManagedPostWrite
  ): Promise<ManagedPostSnapshot> {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Post" WHERE id = ${id} AND "organizationId" = ${scope.organizationId} AND "profileId" = ${scope.profileId} FOR UPDATE`;
      const old = await this.detail(scope, id, tx);
      if (old.version !== expectedVersion)
        postError('POST_VERSION_CONFLICT', 409);
      const root = old.rows[0];
      if (!change.allowPublicationWindow) guardPostWindow(root);
      if (change.tagIds) {
        const tags = await tx.tags.count({
          where: {
            id: { in: change.tagIds },
            orgId: scope.organizationId,
            profileId: scope.profileId,
            deletedAt: null,
          },
        });
        if (tags !== new Set(change.tagIds).size)
          postError('POST_TAG_NOT_FOUND', 404);
      }
      const data = {
        ...(change.date ? { publishDate: new Date(change.date) } : {}),
        ...(change.settings !== undefined
          ? { settings: JSON.stringify(change.settings) }
          : {}),
        ...(change.intervalInDays !== undefined
          ? { intervalInDays: change.intervalInDays }
          : {}),
        ...(change.state ? { state: change.state } : {}),
        ...(change.resetRelease
          ? { releaseId: null, releaseURL: null, error: null }
          : {}),
        ...(change.deleted ? { deletedAt: new Date() } : {}),
      };
      const ids = old.rows.map((p) => p.id);
      if (change.messages) {
        const keep = new Set<string>();
        let parent: string | null = null;
        for (const [index, message] of change.messages.entries()) {
          const messageId = message.id || (index === 0 ? id : randomUUID());
          if (
            keep.has(messageId) ||
            (index === 0 && messageId !== id) ||
            (message.id && !ids.includes(messageId)) ||
            (index > 0 && messageId === id)
          )
            postError('POST_MESSAGE_ID_INVALID');
          keep.add(messageId);
          const messageData = {
            ...data,
            content: message.content,
            image: JSON.stringify(message.media),
            delay: message.delay || 0,
            parentPostId: parent,
          };
          if (ids.includes(messageId))
            await tx.post.update({
              where: { id: messageId, ...scope },
              data: messageData,
            });
          else
            await tx.post.create({
              data: {
                id: messageId,
                ...scope,
                integrationId: root.integrationId,
                group: root.group,
                // comentario novo entra no lote da raiz (editor do lote)
                ...(root.batchId ? { batchId: root.batchId } : {}),
                state: change.state || root.state,
                publishDate: change.date
                  ? new Date(change.date)
                  : root.publishDate,
                settings: root.settings,
                intervalInDays: root.intervalInDays,
                ...messageData,
              },
            });
          parent = messageId;
        }
        await tx.post.updateMany({
          where: {
            id: { in: ids.filter((value) => !keep.has(value)) },
            ...scope,
          },
          data: { deletedAt: new Date(), parentPostId: null },
        });
      } else
        await tx.post.updateMany({
          where: { id: { in: ids }, ...scope },
          data: { ...data, updatedAt: new Date() },
        });
      if (change.tagIds) {
        await tx.tagsPosts.deleteMany({ where: { postId: id } });
        if (change.tagIds.length)
          await tx.tagsPosts.createMany({
            data: [...new Set(change.tagIds)].map((tagId) => ({
              postId: id,
              tagId,
            })),
          });
      }
      // ScheduledAutomationTarget and remote publication results are deliberately retained.
      return this.detail(scope, id, tx, change.deleted === true);
    });
  }
}
