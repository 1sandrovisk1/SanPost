import { sharedFailureCode } from './shared-flow-ui';
export type EditorEngine = 'instagram' | 'facebook';
export type EditorStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export interface EditorRecord {
  id: string;
  status?: EditorStatus;
  revision?: number;
  updatedAt?: string;
}
type Api = (
  path: string,
  init: { method: string; body: string }
) => Promise<Response>;
type Remember = (
  record: EditorRecord,
  phase: 'prepared' | 'saved' | 'status'
) => void;
async function write(
  api: Api,
  path: string,
  method: string,
  body: unknown
): Promise<Record<string, unknown>> {
  const response = await api(path, { method, body: JSON.stringify(body) });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = new Error(sharedFailureCode(response.status, data));
    if (
      ['MESSENGER_RULE_CONFLICT', 'MESSENGER_PRIORITY_CONFLICT'].includes(
        failure.message
      ) &&
      typeof data?.conflictingFlowName === 'string'
    )
      Object.assign(failure, {
        conflictingFlowName: data.conflictingFlowName.slice(0, 200),
      });
    throw failure;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new Error('INVALID_RESPONSE');
  return data;
}
export async function setEditorStatus(
  api: Api,
  engine: EditorEngine,
  current: EditorRecord,
  status: EditorStatus,
  remember: Remember
) {
  if (
    engine === 'facebook' &&
    (!Number.isInteger(current.revision) || current.revision! < 1)
  )
    throw new Error('REVISION_CONFLICT');
  const data = await write(
    api,
    `${engine === 'instagram' ? '/flows' : '/flows-v2'}/${current.id}/status`,
    'POST',
    {
      status,
      ...(engine === 'facebook' ? { expectedRevision: current.revision } : {}),
    }
  );
  const updated = {
    ...current,
    ...data,
    id: current.id,
    status: (data.status || status) as EditorStatus,
  };
  remember(updated, 'status');
  return updated;
}
export async function saveEditorChanges(
  api: Api,
  options: {
    engine: EditorEngine;
    current?: EditorRecord;
    body: Record<string, unknown>;
    activate?: boolean;
  },
  remember: Remember
) {
  let current = options.current;
  if (options.engine === 'instagram' && !current) {
    const prepared = await write(api, '/flows', 'POST', {
      name: options.body.name,
      integrationId: options.body.integrationId,
    });
    if (typeof prepared.id !== 'string' || !prepared.id)
      throw new Error('INVALID_RESPONSE');
    current = {
      ...prepared,
      id: prepared.id,
      status: (prepared.status || 'DRAFT') as EditorStatus,
    };
    remember(current, 'prepared');
  }
  const legacy = options.engine === 'instagram';
  const data = await write(
    api,
    legacy
      ? `/flows/${current!.id}/quick-update`
      : current
      ? `/flows-v2/${current.id}`
      : '/flows-v2',
    current ? 'PUT' : 'POST',
    {
      ...options.body,
      ...(legacy
        ? {
            activate: false,
            ...(current?.updatedAt
              ? { expectedUpdatedAt: current.updatedAt }
              : {}),
          }
        : current
        ? { expectedRevision: current.revision }
        : {}),
    }
  );
  const savedId = current?.id || data.id;
  if (typeof savedId !== 'string' || !savedId)
    throw new Error('INVALID_RESPONSE');
  const saved: EditorRecord = {
    ...current,
    ...data,
    id: savedId,
    status: (data.status || current?.status || 'DRAFT') as EditorStatus,
  };
  remember(saved, 'saved');
  if (options.activate && saved.status !== 'ACTIVE')
    return setEditorStatus(api, options.engine, saved, 'ACTIVE', remember);
  return saved;
}
