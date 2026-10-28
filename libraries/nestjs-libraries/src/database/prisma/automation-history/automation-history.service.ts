import { HttpException, Injectable } from '@nestjs/common';
import { AutomationHistoryRepository } from './automation-history.repository';
import type { FlowScope } from '../../../dtos/flows/flow-v2.dto';
import type {
  AutomationHistoryQueryDto,
  AutomationExecutionSummary,
  AutomationExecutionDetail,
  AutomationExecutionStep,
  AutomationExecutionPage,
  HistoryEngine,
  HistoryStatus,
} from '../../../dtos/flows/automation-history.dto';
const record = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const text = (v: unknown, max = 2000): string | null =>
  typeof v === 'string' && v ? v.slice(0, max) : null;
const iso = (v: unknown): string | null =>
  (typeof v === 'string' || v instanceof Date) &&
  Number.isFinite(new Date(v).getTime())
    ? new Date(v).toISOString()
    : null;
const issueCodes = [
  'TOKEN_INVALID',
  'APP_MISMATCH',
  'PERMISSION_DENIED',
  'RATE_LIMITED',
  'META_REJECTED',
  'OUTCOME_UNKNOWN',
  'INVALID_INPUT',
];
function safeIssue(value: unknown): AutomationExecutionStep['issue'] {
  let category = value;
  if (typeof value === 'string') {
    try {
      category = record(JSON.parse(value)).category;
    } catch {
      /* Only exact known codes are exposed. */
    }
  }
  return typeof category === 'string' && issueCodes.includes(category)
    ? (category as AutomationExecutionStep['issue'])
    : null;
}
const legacyStepStates: Record<string, AutomationExecutionStep['status']> = {
  entered: 'started',
  completed: 'completed',
  error: 'failed',
  awaiting_postback: 'waiting',
  skipped: 'skipped',
  gate_blocked: 'skipped',
  gate_exhausted: 'skipped',
  gate_passed: 'completed',
  follow_check: 'completed',
};
const deliveryStepStates: Record<string, AutomationExecutionStep['status']> = {
  SENT: 'accepted',
  UNKNOWN: 'unknown',
  SENDING: 'started',
  FAILED: 'failed',
  CANCELLED: 'skipped',
};
const kinds = [
  'TRIGGER',
  'CONDITION',
  'REPLY_COMMENT',
  'SEND_DM',
  'DELAY',
  'GATE_RESOLVE',
];
@Injectable()
export class AutomationHistoryService {
  constructor(private readonly repository: AutomationHistoryRepository) {}
  private assert(scope: FlowScope, engine: string) {
    if (!scope.organizationId || !scope.profileId)
      throw new HttpException('PROFILE_REQUIRED', 403);
    if (!['instagram', 'shared'].includes(engine))
      throw new HttpException('INVALID_HISTORY_ENGINE', 400);
  }
  private state(row: any): HistoryStatus {
    if (
      row.status === 'UNKNOWN' ||
      row.deliveries?.some((d: any) => d.status === 'UNKNOWN')
    )
      return 'unknown';
    if (row.status === 'WAITING_POSTBACK') return 'waiting';
    if (row.status === 'COMPLETED') return 'completed';
    if (row.status === 'FAILED') return 'failed';
    if (['RUNNING', 'PENDING'].includes(row.status)) return 'running';
    return ['CANCELLED', 'SKIPPED_CONDITION', 'SKIPPED_CONFLICT'].includes(
      row.status
    )
      ? 'skipped'
      : 'unknown';
  }
  private summary(
    row: any,
    engine: HistoryEngine,
    context: any
  ): AutomationExecutionSummary {
    const event = engine === 'shared' ? record(record(row.snapshot).event) : {};
    const trigger =
      engine === 'instagram'
        ? row.triggerType || 'comment_on_post'
        : event.eventType || 'comment_on_post';
    const status = this.state(row);
    return {
      id: row.id,
      status,
      channel:
        engine === 'instagram' || row.platform === 'instagram'
          ? 'instagram'
          : trigger === 'messenger_message'
          ? 'messenger'
          : 'facebook',
      trigger: ['comment_on_post', 'story_reply', 'messenger_message'].includes(
        trigger
      )
        ? trigger
        : 'unknown',
      actorName: text(
        engine === 'instagram' ? row.igCommenterName : event.actorName,
        200
      ),
      actorId: text(
        engine === 'instagram' ? row.igCommenterId : event.externalActorId,
        200
      ),
      text: text(engine === 'instagram' ? row.commentText : event.text),
      textTruncated:
        typeof (engine === 'instagram' ? row.commentText : event.text) ===
          'string' &&
        (engine === 'instagram' ? row.commentText : event.text).length > 2000,
      accountName: text(
        engine === 'instagram'
          ? context.integration?.name
          : context.channels?.find(
              (c: any) => c.integrationId === row.integrationId
            )?.integration?.name,
        200
      ),
      startedAt: iso(row.startedAt || row.createdAt)!,
      completedAt: iso(row.completedAt),
      guidance:
        status === 'waiting'
          ? 'waiting_interaction'
          : status === 'unknown'
          ? 'outcome_unknown'
          : status === 'failed'
          ? 'failed'
          : row.status === 'CANCELLED'
          ? 'cancelled'
          : row.error === 'MESSENGER_HIGHER_PRIORITY'
          ? 'higher_priority'
          : row.status === 'SKIPPED_CONDITION'
          ? 'condition'
          : null,
    };
  }
  async list(
    scope: FlowScope,
    engine: HistoryEngine,
    flowId: string,
    query: AutomationHistoryQueryDto
  ): Promise<AutomationExecutionPage> {
    this.assert(scope, engine);
    const limit = query.limit ?? 25;
    if (
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50 ||
      (query.from && !iso(query.from)) ||
      (query.to && !iso(query.to)) ||
      (query.from && query.to && new Date(query.from) > new Date(query.to))
    )
      throw new HttpException('INVALID_HISTORY_QUERY', 400);
    let cursor: { at: Date; id: string } | undefined;
    if (query.cursor) {
      try {
        const parsed = JSON.parse(
          Buffer.from(query.cursor, 'base64url').toString('utf8')
        );
        if (
          !iso(parsed.at) ||
          typeof parsed.id !== 'string' ||
          !/^[\w-]{1,100}$/.test(parsed.id)
        )
          throw new Error();
        cursor = { at: new Date(parsed.at), id: parsed.id };
      } catch {
        throw new HttpException('INVALID_HISTORY_CURSOR', 400);
      }
    }
    const context = await this.repository.context(scope, engine, flowId);
    if (!context) throw new HttpException('FLOW_NOT_FOUND', 404);
    const rows = await this.repository.list(
      scope,
      engine,
      flowId,
      { ...query, limit },
      cursor
    );
    const shown = rows.slice(0, limit);
    const last = shown[shown.length - 1];
    return {
      items: shown.map((row) => this.summary(row, engine, context)),
      nextCursor:
        rows.length > limit && last
          ? Buffer.from(
              JSON.stringify({ at: iso(last.createdAt), id: last.id })
            ).toString('base64url')
          : null,
    };
  }
  async detail(
    scope: FlowScope,
    engine: HistoryEngine,
    flowId: string,
    id: string
  ): Promise<AutomationExecutionDetail> {
    this.assert(scope, engine);
    const context = await this.repository.context(scope, engine, flowId);
    if (!context) throw new HttpException('FLOW_NOT_FOUND', 404);
    const row = await this.repository.detail(scope, engine, flowId, id);
    if (!row) throw new HttpException('EXECUTION_NOT_FOUND', 404);
    const data = row as any;
    let log: unknown = [];
    if (engine === 'instagram') {
      try {
        log = JSON.parse(data.executionLog || '[]');
      } catch {
        /* Historical malformed logs remain readable. */
      }
    }
    const entries = Array.isArray(log)
      ? log.filter((v) => v && typeof v === 'object')
      : [];
    const steps: AutomationExecutionStep[] =
      engine === 'instagram'
        ? entries.slice(-200).map((entry: any, index) => ({
            id: String(index),
            kind:
              entry.status === 'follow_check'
                ? 'GATE_RESOLVE'
                : kinds.includes(entry.nodeType)
                ? entry.nodeType
                : 'UNKNOWN',
            status: legacyStepStates[entry.status] || 'unclassified',
            at: iso(entry.timestamp),
            message: null,
            issue:
              entry.status === 'gate_exhausted'
                ? 'GATE_EXHAUSTED'
                : entry.error === 'keywords_not_matched'
                ? 'KEYWORDS_NOT_MATCHED'
                : entry.error === 'follow_gate_applied' ||
                  /^source=(story_reply|comment) follows=false$/.test(
                    entry.error || ''
                  )
                ? 'FOLLOW_REQUIRED'
                : /^source=(story_reply|comment) follows=true$/.test(
                    entry.error || ''
                  )
                ? 'FOLLOW_CONFIRMED'
                : safeIssue(entry.error),
          }))
        : (data.deliveries || []).map((delivery: any) => {
            const actions = record(data.snapshot).actions;
            const action = Array.isArray(actions)
              ? actions.find((a) => record(a).key === delivery.actionKey)
              : undefined;
            return {
              id: delivery.id,
              kind:
                delivery.actionKey === 'private_reply' ||
                delivery.actionKey === 'messenger_reply'
                  ? 'SEND_DM'
                  : delivery.actionKey?.startsWith('public:')
                  ? 'REPLY_COMMENT'
                  : 'UNKNOWN',
              status: deliveryStepStates[delivery.status] || 'unclassified',
              at: iso(delivery.updatedAt || delivery.createdAt),
              message: text(record(action).text),
              issue: safeIssue(delivery.error),
            };
          });
    const event = record(record(data.snapshot).event);
    return {
      ...this.summary(data, engine, context),
      steps,
      logTruncated: entries.length > 200,
      technical: {
        flowId,
        engine,
        integrationId:
          engine === 'instagram' ? context.integrationId : data.integrationId,
        revision: Number.isInteger(data.revision) ? data.revision : null,
        postId: text(
          engine === 'instagram' ? data.igMediaId : event.externalPostId,
          200
        ),
      },
    };
  }
}
