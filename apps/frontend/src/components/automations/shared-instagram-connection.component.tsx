'use client';
import { useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export function useInstagramEditorConnection(integrationId: string) {
  const fetchApi = useFetch();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    id: string;
    attempt: number;
    ready: boolean;
    error?: string;
  }>();
  useEffect(() => {
    if (!integrationId) return;
    let canceled = false;
    fetchApi(`/flows/integrations/${integrationId}/webhook-status`)
      .then(async (response) => {
        if (!response.ok) throw new Error('webhook_check_failed');
        const body = await response.json();
        if (!canceled)
          setResult({
            id: integrationId,
            attempt,
            ready: body.ok === true,
            error: typeof body.error === 'string' ? body.error : undefined,
          });
      })
      .catch(() => {
        if (!canceled) setResult({ id: integrationId, attempt, ready: false });
      });
    return () => {
      canceled = true;
    };
  }, [fetchApi, integrationId, attempt]);
  const current =
    result?.id === integrationId && result.attempt === attempt
      ? result
      : undefined;
  return {
    loading: !!integrationId && !current,
    ready: current?.ready === true,
    error: current?.error,
    retry: () => setAttempt((n) => n + 1),
  };
}
export function InstagramEditorConnection({
  connection,
}: {
  connection: ReturnType<typeof useInstagramEditorConnection>;
}) {
  const t = useT();
  return (
    <div
      role={connection.loading || connection.ready ? 'status' : 'alert'}
      className="mt-3 rounded-lg bg-newBgColor px-3 py-2 text-xs text-newTextColor/70"
    >
      {connection.loading ? (
        t('checking_webhook')
      ) : connection.ready ? (
        t('webhook_ok')
      ) : (
        <>
          <p>{connection.error || t('webhook_check_failed')}</p>
          <div className="mt-2 flex flex-wrap gap-4">
            <button
              type="button"
              className="underline"
              onClick={connection.retry}
            >
              {t('fb_auto_retry')}
            </button>
            <a
              href="/settings?tab=credentials"
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              {t('automation_connection_settings')}
            </a>
          </div>
        </>
      )}
    </div>
  );
}
