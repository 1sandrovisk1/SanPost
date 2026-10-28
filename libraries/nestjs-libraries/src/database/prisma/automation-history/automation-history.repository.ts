import { HttpException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { FlowScope } from '../../../dtos/flows/flow-v2.dto';
import type {
  AutomationHistoryQueryDto,
  HistoryEngine,
} from '../../../dtos/flows/automation-history.dto';
const legacySelect = {
  id: true,
  flowId: true,
  triggerType: true,
  igCommenterId: true,
  igCommenterName: true,
  igMediaId: true,
  commentText: true,
  status: true,
  startedAt: true,
  createdAt: true,
  completedAt: true,
} as const;
const sharedSelect = {
  id: true,
  flowId: true,
  integrationId: true,
  platform: true,
  revision: true,
  status: true,
  error: true,
  createdAt: true,
  completedAt: true,
  snapshot: true,
} as const;
@Injectable()
export class AutomationHistoryRepository {
  constructor(private readonly db: PrismaService) {}
  private flow(scope: FlowScope, engine: HistoryEngine): Prisma.FlowWhereInput {
    if (!scope.organizationId || !scope.profileId)
      throw new HttpException('PROFILE_REQUIRED', 403);
    return {
      organizationId: scope.organizationId,
      profileId: scope.profileId,
      executionVersion: engine === 'instagram' ? 1 : 2,
      deletedAt: null,
    };
  }
  async context(scope: FlowScope, engine: HistoryEngine, id: string) {
    const flow = await this.db.flow.findFirst({
      where: { id, ...this.flow(scope, engine) },
      select: {
        id: true,
        integrationId: true,
        integration: { select: { name: true } },
        channels: { select: { integrationId: true } },
      },
    });
    if (!flow) return null;
    const ids = (flow.channels || []).map((c) => c.integrationId);
    const accounts = ids.length
      ? await this.db.integration.findMany({
          where: {
            organizationId: scope.organizationId,
            profileId: scope.profileId,
            id: { in: ids },
          },
          select: { id: true, name: true },
        })
      : [];
    return {
      ...flow,
      channels: (flow.channels || []).map((c) => ({
        ...c,
        integration: {
          name: accounts.find((a) => a.id === c.integrationId)?.name,
        },
      })),
    };
  }
  private sharedStatus(
    status: AutomationHistoryQueryDto['status']
  ): Prisma.FlowExecutionV2WhereInput {
    if (!status || status === 'all') return {};
    const unknown: Prisma.FlowExecutionV2WhereInput = {
      OR: [
        { status: 'UNKNOWN' },
        { deliveries: { some: { status: 'UNKNOWN' } } },
        {
          status: {
            notIn: [
              'COMPLETED',
              'FAILED',
              'PENDING',
              'RUNNING',
              'CANCELLED',
              'SKIPPED_CONDITION',
              'SKIPPED_CONFLICT',
              'UNKNOWN',
            ],
          },
        },
      ],
    };
    if (status === 'unknown') return unknown;
    const values = {
      completed: ['COMPLETED'],
      failed: ['FAILED'],
      running: ['PENDING', 'RUNNING'],
      skipped: ['CANCELLED', 'SKIPPED_CONDITION', 'SKIPPED_CONFLICT'],
      waiting: [],
    } as const;
    return { AND: [{ NOT: unknown }, { status: { in: [...values[status]] } }] };
  }
  list(
    scope: FlowScope,
    engine: HistoryEngine,
    flowId: string,
    query: AutomationHistoryQueryDto,
    cursor?: { at: Date; id: string }
  ) {
    const range = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    const base = {
      flowId,
      flow: this.flow(scope, engine),
      ...(Object.keys(range).length ? { createdAt: range } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.at } },
              { createdAt: cursor.at, id: { lt: cursor.id } },
            ],
          }
        : {}),
    };
    const pagination = {
      take: (query.limit ?? 25) + 1,
      orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    };
    if (engine === 'instagram') {
      const statuses = {
        completed: ['COMPLETED'],
        waiting: ['WAITING_POSTBACK'],
        failed: ['FAILED'],
        running: ['RUNNING'],
        skipped: ['CANCELLED'],
        unknown: [],
      } as const;
      return this.db.flowExecution.findMany({
        where: {
          ...base,
          ...(query.status && query.status !== 'all'
            ? { status: { in: [...statuses[query.status]] } }
            : {}),
        },
        ...pagination,
        select: legacySelect,
      });
    }
    return this.db.flowExecutionV2.findMany({
      where: {
        AND: [
          {
            ...base,
            organizationId: scope.organizationId,
            profileId: scope.profileId,
          },
          this.sharedStatus(query.status),
        ],
      },
      ...pagination,
      select: { ...sharedSelect, deliveries: { select: { status: true } } },
    });
  }
  detail(scope: FlowScope, engine: HistoryEngine, flowId: string, id: string) {
    const where = { id, flowId, flow: this.flow(scope, engine) };
    return engine === 'instagram'
      ? this.db.flowExecution.findFirst({
          where,
          select: { ...legacySelect, executionLog: true },
        })
      : this.db.flowExecutionV2.findFirst({
          where: {
            ...where,
            organizationId: scope.organizationId,
            profileId: scope.profileId,
          },
          select: {
            ...sharedSelect,
            deliveries: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: {
                id: true,
                actionKey: true,
                error: true,
                status: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        });
  }
}
