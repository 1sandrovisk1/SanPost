'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  useT,
  useTranslationSettings,
} from '@gitroom/react/translation/get.transation.service.client';
import { AutomationContextHelp } from './shared-context-help.component';
import { Button } from '@gitroom/react/form/button';
import { SettingsDrawer } from '../settings/settings-drawer.component';
import { useSharedFlowData } from './hooks/use-shared-flows';
import type {
  AutomationExecutionPage,
  AutomationExecutionDetail,
  AutomationExecutionSummary,
  HistoryEngine,
} from '@gitroom/nestjs-libraries/dtos/flows/automation-history.dto';
export function formatHistoryDate(
  value: string | null | undefined,
  language: string
) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(
      language.startsWith('pt') ? 'pt-BR' : language || 'en',
      { dateStyle: 'short', timeStyle: 'medium', hour12: false }
    ).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat('en', {
      dateStyle: 'short',
      timeStyle: 'medium',
      hour12: false,
    }).format(new Date(value));
  }
}
const tones: Record<string, string> = {
  completed:
    'border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  accepted:
    'border-emerald-600/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  waiting:
    'border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  running: 'border-blue-600/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  failed: 'border-red-600/30 bg-red-500/10 text-red-700 dark:text-red-400',
  unknown:
    'border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
};
function Badge({
  status,
  step = false,
  priority = false,
  waitingClick = false,
}: {
  status: string;
  step?: boolean;
  priority?: boolean;
  waitingClick?: boolean;
}) {
  const t = useT();
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${
        tones[status] || 'border-newTableBorder text-newTextColor/65'
      }`}
    >
      {t(
        priority && status === 'skipped'
          ? 'history_status_priority'
          : waitingClick && status === 'waiting'
          ? 'history_status_waiting_click'
          : `${step ? 'history_step' : 'history_status'}_${status}`
      )}
    </span>
  );
}
function ExecutionDrawer({
  engine,
  flowId,
  id,
  onClose,
}: {
  engine: HistoryEngine;
  flowId: string;
  id: string;
  onClose: () => void;
}) {
  const t = useT();
  const { resolvedLanguage } = useTranslationSettings();
  const [finished, setFinished] = useState(false);
  const result = useSharedFlowData<AutomationExecutionDetail>(
    `/automation-history/${engine}/${encodeURIComponent(
      flowId
    )}/${encodeURIComponent(id)}`,
    finished ? 0 : 5000
  );
  const detail = result.data;
  const valid =
    detail?.id === id && Array.isArray(detail.steps) && detail.technical;
  useEffect(() => {
    if (
      result.error ||
      (detail &&
        ['completed', 'failed', 'skipped', 'unknown'].includes(detail.status))
    )
      setFinished(true);
  }, [result.error, detail]);
  const refresh = () => {
    setFinished(false);
    void Promise.resolve(result.mutate()).catch(() => undefined);
  };
  return (
    <SettingsDrawer
      id="automation-execution-detail"
      title={`${t('history_execution')}${
        valid
          ? ` · ${
              detail.actorName ||
              detail.actorId ||
              t('history_actor_unavailable')
            }`
          : ''
      }`}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button secondary disabled={result.isLoading} onClick={refresh}>
            {t('history_refresh')}
          </Button>
        </div>
      }
    >
      {result.isLoading && <p role="status">{t('history_loading_detail')}</p>}
      {(result.error || (detail && !valid)) && (
        <p role="alert" className="text-btnPrimary">
          {t('history_detail_error')}
        </p>
      )}
      {valid && (
        <>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                status={detail.status}
                priority={detail.guidance === 'higher_priority'}
                waitingClick={detail.steps.some(
                  (s) => s.kind === 'TRIGGER' && s.status === 'waiting'
                )}
              />
              <time
                dateTime={detail.startedAt}
                className="text-xs text-newTextColor/60"
              >
                {formatHistoryDate(detail.startedAt, resolvedLanguage)}
              </time>
            </div>
            <p className="text-sm text-newTextColor/70">
              {detail.accountName || t('history_account_unavailable')} ·{' '}
              {t(`history_trigger_${detail.trigger}`)}
            </p>
            {detail.guidance && detail.guidance !== 'higher_priority' && (
              <p className="rounded-lg border border-newTableBorder bg-newBgColor p-3">
                {t(`history_guidance_${detail.guidance}`)}
              </p>
            )}
          </div>
          <section className="space-y-2">
            <h3 className="font-semibold">{t('history_interaction')}</h3>
            <p className="whitespace-pre-wrap break-words rounded-lg bg-newBgColor p-3">
              {detail.text || t('history_text_unavailable')}
            </p>
            {detail.textTruncated && (
              <p className="text-xs text-newTextColor/60">
                {t('history_text_truncated')}
              </p>
            )}
          </section>
          <section className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">{t('history_steps')}</h3>
              {engine !== 'instagram' &&
                detail.steps.some((s) => s.status === 'accepted') && (
                  <AutomationContextHelp label={t('history_step_help')}>
                    {t('history_accepted_hint')}
                  </AutomationContextHelp>
                )}
            </div>
            {engine === 'instagram' && (
              <p className="text-xs text-newTextColor/60">
                {t('history_legacy_step_hint')}
              </p>
            )}
            {!detail.steps.length && (
              <p className="text-newTextColor/65">{t('history_no_steps')}</p>
            )}
            <ol className="space-y-4 border-l border-newTableBorder pl-4">
              {detail.steps.map((step, index) => (
                <li key={`${step.id}-${index}`} className="relative space-y-2">
                  <span
                    aria-hidden="true"
                    className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border border-newTableBorder bg-newTextColor/50"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-medium">
                      {t(
                        step.kind === 'TRIGGER' && step.status === 'waiting'
                          ? 'history_trigger_waiting_click'
                          : `history_kind_${step.kind.toLowerCase()}`
                      )}
                    </h4>
                    <Badge step status={step.status} />
                  </div>
                  {step.at && (
                    <time
                      className="block text-xs text-newTextColor/60"
                      dateTime={step.at}
                    >
                      {formatHistoryDate(step.at, resolvedLanguage)}
                    </time>
                  )}
                  {step.issue && (
                    <p className="text-xs text-newTextColor/70">
                      {t(`history_issue_${step.issue.toLowerCase()}`)}
                    </p>
                  )}
                  {step.message && (
                    <div className="rounded-lg bg-newBgColor p-3 space-y-1">
                      <p className="whitespace-pre-wrap break-words">
                        {step.message}
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ol>
            {detail.logTruncated && (
              <p className="text-xs text-newTextColor/60">
                {t('history_log_truncated')}
              </p>
            )}
          </section>
          <details className="rounded-lg border border-newTableBorder p-3">
            <summary className="cursor-pointer font-medium">
              {t('history_technical')}
            </summary>
            <dl className="mt-3 space-y-3 text-xs">
              {[
                [t('history_execution_id'), detail.id],
                [t('history_flow_id'), detail.technical.flowId],
                [t('history_actor_id'), detail.actorId],
                [t('history_engine'), detail.technical.engine],
                [t('history_integration_id'), detail.technical.integrationId],
                [t('history_revision'), detail.technical.revision],
                [t('history_post_id'), detail.technical.postId],
                [
                  t('history_finished_at'),
                  formatHistoryDate(detail.completedAt, resolvedLanguage),
                ],
              ]
                .filter(([, value]) => value !== null && value !== undefined)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-newTextColor/60">{label}</dt>
                    <dd className="mt-1 break-all font-mono">
                      {String(value)}
                    </dd>
                  </div>
                ))}
            </dl>
          </details>
        </>
      )}
    </SettingsDrawer>
  );
}
export function AutomationExecutionHistory({
  engine,
  flowId,
}: {
  engine: HistoryEngine;
  flowId: string;
}) {
  const t = useT();
  const { resolvedLanguage } = useTranslationSettings();
  const [timezone, setTimezone] = useState<string | null>(null);
  useEffect(
    () => setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone),
    []
  );
  const timezoneName = timezone
    ? new Intl.DateTimeFormat(resolvedLanguage || 'en', {
        timeZone: timezone,
        timeZoneName: 'long',
      })
        .formatToParts(new Date())
        .find((p) => p.type === 'timeZoneName')?.value || timezone
    : t('history_timezone_browser');
  const [status, setStatus] = useState('all');
  const [period, setPeriod] = useState('all');
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const [selected, setSelected] = useState<string | null>(null);
  const from = useMemo(
    () =>
      period === 'all'
        ? null
        : new Date(Date.now() - Number(period) * 86400000).toISOString(),
    [period]
  );
  const params = new URLSearchParams({ status, limit: '25' });
  if (from) params.set('from', from);
  const cursor = cursors[cursors.length - 1];
  if (cursor) params.set('cursor', cursor);
  const result = useSharedFlowData<AutomationExecutionPage>(
    `/automation-history/${engine}/${encodeURIComponent(flowId)}?${params}`,
    5000
  );
  const valid = Array.isArray(result.data?.items);
  const items = valid ? result.data!.items : [];
  const failed = Boolean(result.error || (result.data && !valid));
  const filter = (kind: 'status' | 'period', value: string) => {
    setCursors([null]);
    if (kind === 'status') setStatus(value);
    else setPeriod(value);
  };
  const refresh = (): void => {
    void Promise.resolve(result.mutate()).catch((): undefined => undefined);
  };
  return (
    <section className="mx-auto w-full max-w-[1400px] space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t('history_title')}</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-newTextColor/55">
          {!failed && <span>{t('history_auto_refresh')}</span>}
          <button
            type="button"
            aria-label={t('history_refresh')}
            disabled={result.isLoading}
            onClick={refresh}
            className="rounded-lg border border-newTableBorder p-2 hover:bg-boxHover disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-btnPrimary"
          >
            <svg
              aria-hidden="true"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
            >
              <path d="M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1" />
            </svg>
          </button>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-xs text-newTextColor/65">
          <span className="block">{t('history_filter_status')}</span>
          <select
            className="rounded-lg border border-newTableBorder bg-newBgColorInner px-3 py-2 text-sm text-newTextColor"
            value={status}
            onChange={(e) => filter('status', e.target.value)}
          >
            {[
              'all',
              'completed',
              'waiting',
              'failed',
              'running',
              'skipped',
              'unknown',
            ].map((value) => (
              <option key={value} value={value}>
                {t(
                  value === 'all'
                    ? 'history_all_statuses'
                    : `history_status_${value}`
                )}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-newTextColor/65">
          <span className="block">{t('history_filter_period')}</span>
          <select
            className="rounded-lg border border-newTableBorder bg-newBgColorInner px-3 py-2 text-sm text-newTextColor"
            value={period}
            onChange={(e) => filter('period', e.target.value)}
          >
            {['all', '7', '30', '90'].map((value) => (
              <option key={value} value={value}>
                {t(`history_period_${value}`)}
              </option>
            ))}
          </select>
        </label>
        <div className="mb-1 flex items-center gap-1 text-xs text-newTextColor/50">
          <span>{timezoneName}</span>
          <AutomationContextHelp label={t('history_timezone_help')}>
            {timezone
              ? t('history_timezone').replace('{timezone}', timezone)
              : t('history_timezone_browser')}
          </AutomationContextHelp>
        </div>
      </div>
      {result.isLoading && (
        <p role="status" className="p-4 text-sm text-newTextColor/65">
          {t('history_loading')}
        </p>
      )}
      {failed && (
        <p
          role="alert"
          className="rounded-lg border border-red-600/30 bg-red-500/5 p-4 text-sm"
        >
          {t('history_load_error')}
        </p>
      )}
      {!result.isLoading && !failed && valid && !items.length && (
        <div className="rounded-xl border border-newTableBorder p-10 text-center space-y-2">
          <p className="font-medium">
            {t(
              status === 'all' && period === 'all'
                ? 'history_empty'
                : 'history_empty_filtered'
            )}
          </p>
          <p className="text-sm text-newTextColor/60">
            {t('history_empty_hint')}
          </p>
        </div>
      )}
      {!!items.length && (
        <div className="overflow-x-auto rounded-xl border border-newTableBorder">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-newTableBorder bg-newBgColor text-xs text-newTextColor/65">
              <tr>
                {[
                  'actor',
                  'interaction',
                  'channel',
                  'situation',
                  'started',
                ].map((key) => (
                  <th key={key} className="p-3 font-medium">
                    {t(`history_column_${key}`)}
                  </th>
                ))}
                <th className="p-3">
                  <span className="sr-only">{t('history_view_details')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item: AutomationExecutionSummary) => (
                <tr
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                  className="cursor-pointer border-b border-newTableBorder last:border-b-0 hover:bg-boxHover"
                >
                  <td className="p-3">
                    <p className="font-medium">
                      {item.actorName ||
                        item.actorId ||
                        t('history_actor_unavailable')}
                    </p>
                    <p className="text-xs text-newTextColor/50">
                      {item.accountName || t('history_account_unavailable')}
                    </p>
                  </td>
                  <td className="max-w-[320px] p-3">
                    <p className="line-clamp-2 break-words text-newTextColor/75">
                      {item.text || t('history_text_unavailable')}
                    </p>
                  </td>
                  <td className="p-3">
                    <p>
                      {item.channel === 'messenger'
                        ? 'Messenger'
                        : item.channel === 'facebook'
                        ? 'Facebook'
                        : 'Instagram'}
                    </p>
                    <p className="mt-1 text-xs text-newTextColor/50">
                      {t(`history_trigger_${item.trigger}`)}
                    </p>
                  </td>
                  <td className="p-3">
                    <Badge
                      status={item.status}
                      priority={item.guidance === 'higher_priority'}
                    />
                  </td>
                  <td className="whitespace-nowrap p-3 text-xs text-newTextColor/65">
                    <time dateTime={item.startedAt}>
                      {formatHistoryDate(item.startedAt, resolvedLanguage)}
                    </time>
                  </td>
                  <td className="p-3">
                    <button
                      type="button"
                      className="whitespace-nowrap rounded-lg border border-newTableBorder px-3 py-2 text-xs hover:bg-boxHover focus-visible:ring-2 focus-visible:ring-btnPrimary"
                      aria-label={`${t('history_view_details')} · ${
                        item.actorName || item.id
                      }`}
                      onClick={() => setSelected(item.id)}
                    >
                      {t('history_view_details')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(cursors.length > 1 || !!result.data?.nextCursor) && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-newTextColor/60">
          <p>{t('history_page').replace('{page}', String(cursors.length))}</p>
          <div className="flex gap-2">
            <Button
              secondary
              disabled={cursors.length === 1 || result.isLoading}
              onClick={() => setCursors((previous) => previous.slice(0, -1))}
            >
              {t('history_previous')}
            </Button>
            <Button
              secondary
              disabled={
                !valid || !result.data?.nextCursor || result.isLoading || failed
              }
              onClick={() => {
                if (result.data?.nextCursor)
                  setCursors((previous) => [
                    ...previous,
                    result.data!.nextCursor,
                  ]);
              }}
            >
              {t('history_next')}
            </Button>
          </div>
        </div>
      )}
      {selected && (
        <ExecutionDrawer
          key={`${engine}:${flowId}:${selected}`}
          engine={engine}
          flowId={flowId}
          id={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
