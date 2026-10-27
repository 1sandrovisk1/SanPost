'use client';
import {
  useT,
  useTranslationSettings,
} from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { useSharedFlowData } from './hooks/use-shared-flows';
import { executionGuidance } from './shared-flow-ui';
import { facebookSetupDateOptions } from '../settings/facebook-automation-dates';
interface ExecutionView {
  id: string;
  createdAt: string;
  platform: string;
  status: string;
  error?: string;
  deliveries: Array<{ actionKey: string; status: string }>;
}
export function SharedFlowHistory({ id }: { id: string }) {
  const t = useT();
  const { resolvedLanguage } = useTranslationSettings();
  const result = useSharedFlowData<ExecutionView[]>(
    `/flows-v2/${id}/executions`,
    5000
  );
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-newTextColor/60">
          {t('shared_history_hint')}
        </p>
        <Button secondary onClick={() => void result.mutate()}>
          {t('shared_refresh')}
        </Button>
      </div>
      {result.isLoading && <p role="status">{t('loading')}</p>}
      {result.error && <p role="alert">{t('shared_history_error')}</p>}
      {result.data?.length === 0 && (
        <p className="rounded-xl border border-newTableBorder p-8 text-center text-sm text-newTextColor/70">
          {t('shared_no_runs')}
        </p>
      )}
      {result.data?.map((item) => {
        const guidance = executionGuidance(
          item.deliveries.some((d) => d.status === 'UNKNOWN')
            ? 'UNKNOWN'
            : item.status,
          item.error
        );
        return (
          <article
            key={item.id}
            className="rounded-xl border border-newTableBorder bg-newBgColorInner p-4 space-y-2 text-sm"
          >
            <div className="flex flex-wrap justify-between gap-2">
              <time dateTime={item.createdAt}>
                {
                  facebookSetupDateOptions(item.createdAt, resolvedLanguage)
                    .time
                }
              </time>
              <span>
                {item.platform === 'facebook' ? 'Facebook' : 'Instagram'} ·{' '}
                {t(
                  `shared_status_${item.status.toLowerCase()}`,
                  t('shared_status_unknown')
                )}
              </span>
            </div>
            {item.deliveries.map((d) => (
              <p key={d.actionKey} className="text-newTextColor/70">
                {t(
                  ['private_reply', 'messenger_reply'].includes(d.actionKey)
                    ? 'shared_message'
                    : 'shared_public_reply'
                )}
                :{' '}
                {t(
                  `shared_status_${d.status.toLowerCase()}`,
                  t('shared_status_unknown')
                )}
              </p>
            ))}
            {guidance && <p className="text-amber-600">{t(guidance)}</p>}
          </article>
        );
      })}
    </section>
  );
}
