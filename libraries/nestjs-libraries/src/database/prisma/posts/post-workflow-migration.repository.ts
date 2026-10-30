import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository } from '../prisma.service';

export const POST_MIGRATION_BATCH_SIZE = 50;

@Injectable()
export class PostWorkflowMigrationRepository {
  constructor(private readonly posts: PrismaRepository<'post'>) {}

  private eligible(): Prisma.PostWhereInput {
    return {
      state: 'QUEUE',
      parentPostId: null,
      deletedAt: null,
      AND: [
        { OR: [{ releaseId: null }, { releaseId: '' }] },
        { OR: [{ releaseURL: null }, { releaseURL: '' }] },
      ],
      publishDate: { gt: new Date() },
      OR: [{ profileId: null }, { profile: { deletedAt: null } }],
      integration: {
        deletedAt: null,
        disabled: false,
        refreshNeeded: false,
        inBetweenSteps: false,
        OR: [{ profileId: null }, { clientProfile: { deletedAt: null } }],
      },
    };
  }

  listCandidates(cursor?: string) {
    return this.posts.model.post.findMany({
      where: this.eligible(),
      select: { id: true },
      orderBy: { id: 'asc' },
      take: POST_MIGRATION_BATCH_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
  }

  async findCandidate(id: string) {
    return this.posts.model.post.findFirst({
      where: { ...this.eligible(), id },
      select: {
        id: true,
        organizationId: true,
        integrationId: true,
        publishDate: true,
        updatedAt: true,
        integration: { select: { providerIdentifier: true } },
      },
    });
  }
}
