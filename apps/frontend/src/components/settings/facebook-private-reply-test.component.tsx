'use client';

import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  useT,
  useTranslationSettings,
} from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import type { FacebookPrivateReplyTestView } from '@gitroom/nestjs-libraries/dtos/integrations/facebook-automation.dto';
import {
  DiagnosticDetails,
  DiagnosticIdentifier,
} from './meta-diagnostics.component';
import { facebookSetupDateOptions } from './facebook-automation-dates';

function usePrivateReplyTest(scope: string, path: string) {
  const fetchApi = useFetch();
  return useSWR<FacebookPrivateReplyTestView>(
    [scope, path],
    async () => {
      const response = await fetchApi(path, { cache: 'no-store' });
      if (!response.ok) throw Error('PROOF_UNAVAILABLE');
      return response.json();
    },
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      keepPreviousData: false,
    }
  );
}

/** Parent keys by credential scope and selected integration, discarding stale action state. */
export function FacebookPrivateReplyTest({
  scope,
  integrationId,
}: {
  scope: string;
  integrationId: string;
}) {
  const t = useT();
  const language = useTranslationSettings().resolvedLanguage;
  const fetchApi = useFetch();
  const path = `/facebook-automations/${integrationId}/private-reply-test`;
  const detail = usePrivateReplyTest(scope, path);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshed, setRefreshed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const view = detail.data;
  async function send() {
    if (
      !view?.available ||
      !view.canSend ||
      !view.revision ||
      inFlight.current ||
      actionError
    )
      return;
    inFlight.current = true;
    setBusy(true);
    try {
      const response = await fetchApi(path, {
        method: 'POST',
        body: JSON.stringify({ revision: view.revision }),
      });
      if (!response.ok) throw Error('PROOF_FAILED');
      const result: FacebookPrivateReplyTestView = await response.json();
      if (result.available !== true || !result.result)
        throw Error('PROOF_INVALID_RESULT');
      if (mounted.current) await detail.mutate(result, { revalidate: false });
    } catch {
      if (mounted.current) setActionError(true);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  if (!detail.error && !view?.available) return null;
  const result = view?.available ? view.result : null;
  const statusText = result
    ? {
        SENDING: t('fb_proof_sending'),
        SENT: t('fb_proof_sent'),
        FAILED: t('fb_proof_failed'),
        UNKNOWN: t('fb_proof_unknown'),
      }[result.status]
    : null;
  return (
    <section
      className="flex flex-col gap-3 border-t border-newTableBorder pt-4"
      aria-label={t('fb_proof_title')}
    >
      <h4 className="font-semibold">{t('fb_proof_title')}</h4>
      {view?.available && !result && (
        <>
          <p className="text-sm text-newTextColor/70">{t('fb_proof_intro')}</p>
          <blockquote className="rounded-lg bg-newBgColor p-3 text-sm break-words">
            {view.text}
          </blockquote>
          {view.blockedReason && (
            <p role="status" className="text-sm">
              {t('fb_proof_receipt_required')}
            </p>
          )}
          <Button
            disabled={
              busy ||
              refreshing ||
              actionError ||
              !!detail.error ||
              !view.canSend
            }
            loading={busy}
            loadingLabel={t('meta_action_sending')}
            onClick={send}
          >
            {t('fb_proof_send')}
          </Button>
        </>
      )}
      {(detail.error || actionError) && (
        <p role="alert" className="text-sm">
          {t('fb_proof_error')}
        </p>
      )}
      {result && (
        <div role="status" className="flex flex-col gap-2 text-sm">
          <p>{statusText}</p>
          {result.updatedAt && (
            <p className="text-xs">
              {t(
                'meta_diagnostic_result_at',
                facebookSetupDateOptions(result.updatedAt, language)
              )}
            </p>
          )}
        </div>
      )}
      {view?.available && (
        <DiagnosticDetails title={t('meta_diagnostic_result_details')}>
          <DiagnosticIdentifier
            label={t('meta_diagnostic_page_id')}
            value={view.pageId}
          />
          <DiagnosticIdentifier
            label={t('meta_diagnostic_post_id')}
            value={view.postId}
          />
          <DiagnosticIdentifier
            label={t('meta_diagnostic_comment_id')}
            value={view.commentId}
          />
          {result && (
            <blockquote className="text-sm break-words">{view.text}</blockquote>
          )}
          {result?.remoteId && (
            <DiagnosticIdentifier
              label={t('meta_diagnostic_message_id')}
              value={result.remoteId}
            />
          )}
          {result?.code !== undefined && (
            <p className="text-xs">
              {t('fb_proof_meta_error', {
                code: result.code,
                subcode: result.subcode ?? '—',
              })}
            </p>
          )}
        </DiagnosticDetails>
      )}
      <Button
        secondary
        disabled={busy || refreshing}
        loading={refreshing}
        loadingLabel={t('meta_action_loading')}
        onClick={async () => {
          if (refreshing || busy) return;
          setRefreshing(true);
          setRefreshed(false);
          try {
            await detail.mutate();
            if (mounted.current) {
              setActionError(false);
              setRefreshed(true);
            }
          } catch {
            if (mounted.current) setActionError(true);
          } finally {
            if (mounted.current) setRefreshing(false);
          }
        }}
      >
        {t('fb_proof_refresh')}
      </Button>
      {refreshed && !actionError && (
        <p role="status" className="text-sm">
          {t('meta_action_updated')}
        </p>
      )}
    </section>
  );
}
