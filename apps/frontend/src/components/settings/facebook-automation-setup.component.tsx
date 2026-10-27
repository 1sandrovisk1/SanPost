'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import useSWR from 'swr';
import { useSearchParams } from 'next/navigation';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import {
  useT,
  useTranslationSettings,
} from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { Select } from '@gitroom/react/form/select';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import type {
  FacebookSetupStage,
  FacebookSetupStatus,
  FacebookSetupView,
} from '@gitroom/nestjs-libraries/dtos/integrations/facebook-automation.dto';
import { FacebookDiagnostics } from './facebook-diagnostics.component';
import { FacebookPrivateReplyTest } from './facebook-private-reply-test.component';
import { facebookSetupDateOptions } from './facebook-automation-dates';
import { FacebookSetupGuide } from './facebook-setup-guide.component';
import { FacebookHelp } from './facebook-help.component';
import {
  SettingsHelpButton,
  SettingsHelpDrawer,
} from './settings-help.component';

interface PageChoice {
  id: string;
  pageId: string;
  name: string;
}

type SetupAction = 'authorize' | 'activate' | 'check' | 'system-user';

const checkResultMessages: Record<FacebookSetupStage, string> = {
  RECEIVING_READY: 'fb_auto_check_success',
  AUTHORIZATION_REQUIRED: 'fb_auto_status_authorization_required',
  CALLBACK_REQUIRED: 'fb_auto_status_callback_required',
  CALLBACK_CONFLICT: 'fb_auto_status_callback_conflict',
  CHECK_REQUIRED: 'fb_auto_status_check_required',
  CHECK_FAILED: 'fb_auto_status_check_failed',
};

function isSetupStatus(value: unknown): value is FacebookSetupStatus {
  if (!value || typeof value !== 'object') return false;
  const status = value as Partial<FacebookSetupStatus>;
  return (
    typeof status.stage === 'string' &&
    Object.prototype.hasOwnProperty.call(checkResultMessages, status.stage) &&
    typeof status.checkedAt === 'string' &&
    Number.isFinite(Date.parse(status.checkedAt)) &&
    Array.isArray(status.reasons) &&
    status.reasons.every((reason) => typeof reason === 'string') &&
    Array.isArray(status.missingPermissions) &&
    status.missingPermissions.every(
      (permission) => typeof permission === 'string'
    ) &&
    status.automaticRepliesAvailable === false
  );
}

function useFacebookSetupData<T>(scope: string, path: string | null) {
  const fetchApi = useFetch();
  return useSWR<T>(
    path ? [scope, path] : null,
    async () => {
      const response = await fetchApi(path!, { cache: 'no-store' });
      if (!response.ok) throw new Error('SETUP_UNAVAILABLE');
      return response.json();
    },
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      keepPreviousData: false,
      refreshInterval: path && path !== '/facebook-automations' ? 10000 : 0,
      refreshWhenHidden: false,
    }
  );
}

function FacebookSetupForProfile({
  scope,
  organizationId,
  profileId,
  onOpenMessenger,
  onOpenSystemUser,
  helpOpen,
  onHelpChange,
  helpId,
}: {
  scope: string;
  organizationId: string;
  profileId: string;
  onOpenMessenger: () => void;
  onOpenSystemUser?: () => void;
  helpOpen?: boolean;
  onHelpChange?: (open: boolean) => void;
  helpId?: string;
}) {
  const t = useT();
  const language = useTranslationSettings().resolvedLanguage;
  const fetchApi = useFetch();
  const params = useSearchParams();
  const [selected, setSelected] = useState(
    params.get('facebookAutomation') || ''
  );
  const [activeAction, setActiveAction] = useState<SetupAction | null>(null);
  const busy = activeAction !== null;
  const checking = activeAction === 'check';
  const [checkFeedback, setCheckFeedback] = useState<{
    integrationId: string;
    stage: FacebookSetupStage;
  } | null>(null);
  const [localHelpOpen, setLocalHelpOpen] = useState(false);
  const showDiagnostics = helpOpen ?? localHelpOpen;
  const setShowDiagnostics = onHelpChange ?? setLocalHelpOpen;
  const localDrawerId = useId();
  const drawerId = helpId ?? localDrawerId;
  const [actionError, setActionError] = useState(false);
  const [actionErrorKey, setActionErrorKey] = useState('fb_auto_error');
  const mounted = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const pages = useFacebookSetupData<PageChoice[]>(
    scope,
    '/facebook-automations'
  );
  const selectedPage = pages.data?.find((page) => page.id === selected);
  const detail = useFacebookSetupData<FacebookSetupView>(
    scope,
    selectedPage ? `/facebook-automations/${selectedPage.id}` : null
  );
  const view = detail.data;

  async function perform(action: SetupAction) {
    if (!selectedPage || inFlight.current) return;
    inFlight.current = true;
    setActiveAction(action);
    setCheckFeedback(null);
    setActionError(false);
    try {
      const response = await fetchApi(
        `/facebook-automations/${selectedPage.id}/${action}`,
        {
          method: 'POST',
          ...(action === 'system-user'
            ? {
                headers: {
                  'x-expected-org-id': organizationId,
                  'x-expected-profile-id': profileId,
                },
              }
            : {}),
        }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const errors: Record<string, string> = {
          SYSTEM_USER_TOKEN_REQUIRED: 'fb_system_error_missing',
          SYSTEM_USER_TYPE_REQUIRED: 'fb_system_error_type',
          SYSTEM_USER_APP_MISMATCH: 'fb_system_error_app',
          SYSTEM_USER_TOKEN_INVALID: 'fb_system_error_invalid',
          SYSTEM_USER_TOKEN_EXPIRED: 'fb_system_error_expired',
          SYSTEM_USER_EXPIRY_UNKNOWN: 'fb_system_error_invalid',
          SYSTEM_USER_PERMISSIONS_MISSING: 'fb_system_error_permissions',
          SYSTEM_USER_PAGE_DENIED: 'fb_system_error_permissions',
          SYSTEM_USER_CHECK_FAILED: 'fb_system_error_check',
          AUTHORIZATION_CHANGED: 'fb_system_error_changed',
          CREDENTIAL_SCOPE_CHANGED: 'fb_system_error_changed',
        };
        throw new Error(
          action === 'system-user'
            ? errors[body?.message] || 'fb_system_error_check'
            : 'fb_auto_error'
        );
      }
      const result = await response.json();
      if (!mounted.current) return;
      if (action === 'authorize') {
        window.location.assign(result.url);
      } else if (action === 'check' || action === 'activate') {
        if (!isSetupStatus(result)) throw new Error('fb_auto_error');
        // The check response is authoritative for the status. Update the badge
        // and feedback together, without overwriting authorization or receipts.
        await detail.mutate(
          (current) => (current ? { ...current, status: result } : current),
          // Reload persisted metadata such as lastReadyAt as well.
          { revalidate: true }
        );
        if (!mounted.current) return;
        setCheckFeedback({
          integrationId: selectedPage.id,
          stage: result.stage,
        });
      } else {
        if (!isSetupStatus(result.status)) throw new Error('fb_auto_error');
        await detail.mutate();
        if (mounted.current)
          setCheckFeedback({
            integrationId: selectedPage.id,
            stage: result.status.stage,
          });
      }
    } catch (error) {
      if (mounted.current) {
        setActionErrorKey(
          error instanceof Error &&
            /^fb_(auto_error$|system_error_)/.test(error.message)
            ? error.message
            : 'fb_auto_error'
        );
        setActionError(true);
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setActiveAction(null);
    }
  }

  const stage = view?.status?.stage;
  const needsAuthorization =
    !view?.authorized || stage === 'AUTHORIZATION_REQUIRED';
  const ready = view?.authorized && stage === 'RECEIVING_READY';
  const hasError = !!(pages.error || detail.error || actionError);
  const failed = stage === 'CHECK_FAILED';
  const pending = needsAuthorization || (!!stage && !ready && !failed);
  const statusText = !view?.authorized
    ? t('fb_auto_status_authorization_required')
    : !stage
    ? t('fb_auto_authorized_unchecked')
    : ready
    ? t('fb_auto_ready_compact')
    : t(`fb_auto_status_${stage.toLowerCase()}`);
  const compactStatus = !view?.authorized
    ? t('fb_auto_compact_authorization_required')
    : !stage
    ? t('fb_auto_compact_unchecked')
    : ready
    ? t('fb_auto_ready_compact')
    : t(`fb_auto_compact_${stage.toLowerCase()}`);
  const stale =
    !!view?.status &&
    Date.now() - new Date(view.status.checkedAt).getTime() > 300000;

  const resultFeedback = selectedPage &&
    !hasError &&
    checkFeedback?.integrationId === selectedPage.id &&
    checkFeedback.stage === stage && (
      <p
        role={ready ? 'status' : 'alert'}
        aria-atomic="true"
        className={`rounded-lg border px-3 py-2 text-sm ${
          ready
            ? 'border-green-500/20 bg-green-500/5 text-green-700 dark:text-green-400'
            : failed
            ? 'border-red-500/30 bg-red-500/5'
            : 'border-amber-500/30 bg-amber-500/5'
        }`}
      >
        {t(checkResultMessages[checkFeedback.stage])}
      </p>
    );

  function renderPageSelector(inDiagnostics = false) {
    if (!pages.data?.length) return null;
    return (
      <Select
        disableForm
        hideErrors
        name={
          inDiagnostics ? 'facebookDiagnosticPage' : 'facebookAutomationPage'
        }
        label={t('fb_auto_select')}
        aria-label={t('fb_auto_select')}
        value={selectedPage?.id || ''}
        disabled={busy}
        onChange={(event) => {
          if (inFlight.current) return;
          setSelected(event.target.value);
          setActionError(false);
          setCheckFeedback(null);
          if (!inDiagnostics) setShowDiagnostics(false);
        }}
      >
        <option value="">{t('fb_auto_choose')}</option>
        {pages.data.map((page) => (
          <option key={page.id} value={page.id}>
            {page.name}
          </option>
        ))}
      </Select>
    );
  }

  const retryButton = (
    <Button
      secondary
      disabled={busy}
      loading={pages.isValidating || detail.isValidating}
      loadingLabel={t('meta_action_loading')}
      onClick={() => {
        setActionError(false);
        // SWR exposes failures for the current key; a late retry must not
        // overwrite the action feedback of a newly selected Page.
        void Promise.allSettled([pages.mutate(), detail.mutate()]);
      }}
    >
      {t('fb_auto_retry')}
    </Button>
  );

  const errorFeedback = hasError && (
    <div
      role="alert"
      className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm space-y-2"
    >
      <p>{t(actionError ? actionErrorKey : 'fb_auto_error')}</p>
      {retryButton}
    </div>
  );

  return (
    <section
      className="mt-5 space-y-4 border-t border-newTableBorder pt-5"
      aria-label={t('fb_auto_page_heading')}
    >
      <div className="flex items-center gap-1">
        <h3 className="text-sm font-semibold">{t('fb_auto_page_heading')}</h3>
        <FacebookHelp
          label={t('fb_auto_page_help_label')}
          text={t('fb_auto_page_help')}
        />
      </div>
      {pages.isLoading && <p>{t('loading')}</p>}
      {pages.data?.length === 0 && (
        <p className="text-sm">{t('fb_auto_no_pages')}</p>
      )}
      {renderPageSelector()}
      {errorFeedback}
      {detail.isLoading && <p>{t('loading')}</p>}
      {selectedPage && view && (
        <>
          {!hasError && (
            <div
              role={failed || pending ? 'alert' : 'status'}
              className={`space-y-2 ${
                failed
                  ? 'rounded-lg border border-red-500/30 bg-red-500/5 p-3'
                  : pending
                  ? 'rounded-lg border border-amber-500/30 bg-amber-500/5 p-3'
                  : ''
              }`}
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p
                  className={
                    ready
                      ? 'inline-flex items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-700 dark:text-green-400'
                      : 'text-sm font-medium'
                  }
                >
                  {ready && <span aria-hidden="true">✓</span>}
                  {compactStatus}
                </p>
                {view.status && (
                  <div className="inline-flex items-center gap-1 text-xs text-newTextColor/60">
                    {stale && <span>{t('fb_auto_previous_check')}</span>}
                    <FacebookHelp
                      label={t('fb_auto_connection_details')}
                      text={[
                        t(
                          'fb_auto_checked_at',
                          facebookSetupDateOptions(
                            view.status.checkedAt,
                            language
                          )
                        ),
                        view.receipt
                          ? t(
                              'fb_auto_last_comment',
                              facebookSetupDateOptions(
                                view.receipt.receivedAt,
                                language
                              )
                            )
                          : '',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    />
                  </div>
                )}
              </div>
              {stage === 'CALLBACK_CONFLICT' && (
                <p className="text-sm">{t('fb_auto_callback_impact')}</p>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {needsAuthorization ? (
              <Button
                disabled={busy}
                loading={activeAction === 'authorize'}
                loadingLabel={t('meta_action_authorizing')}
                onClick={() => perform('authorize')}
              >
                {view.authorized
                  ? t('fb_auto_reauthorize')
                  : t('fb_auto_authorize')}
              </Button>
            ) : (
              <>
                {ready && !hasError && (
                  <a
                    className="inline-flex rounded-lg bg-btnPrimary text-white px-4 py-2 text-sm"
                    href={`/automacoes/compartilhada/nova?channel=${encodeURIComponent(
                      selectedPage.id
                    )}`}
                  >
                    {t('shared_create_automation')}
                  </a>
                )}
                <Button
                  secondary
                  disabled={busy}
                  loading={checking}
                  loadingLabel={t('fb_auto_checking_page')}
                  className="rounded-lg text-sm"
                  onClick={() => perform('check')}
                >
                  {t('fb_auto_check_page')}
                </Button>
                {!ready && (
                  <Button
                    disabled={busy}
                    loading={activeAction === 'activate'}
                    loadingLabel={t('meta_action_activating')}
                    className="rounded-lg text-sm"
                    onClick={() => perform('activate')}
                  >
                    {t('fb_auto_activate')}
                  </Button>
                )}
              </>
            )}
          </div>
          {resultFeedback}
          {needsAuthorization && view.systemUserConfigured && (
            <Button
              secondary
              disabled={busy}
              loading={activeAction === 'system-user'}
              loadingLabel={t('meta_action_applying')}
              className="rounded-lg border border-newTableBorder text-sm"
              onClick={() => perform('system-user')}
            >
              {t('fb_system_use')}
            </Button>
          )}
        </>
      )}
      {!onHelpChange && (
        <SettingsHelpButton
          open={showDiagnostics}
          drawerId={drawerId}
          onClick={() => setShowDiagnostics(true)}
        />
      )}
      {showDiagnostics && (
        <SettingsHelpDrawer
          id={drawerId}
          network="Facebook"
          onClose={() => setShowDiagnostics(false)}
          guide={
            <FacebookSetupGuide
              onOpenMessenger={() => {
                flushSync(() => setShowDiagnostics(false));
                onOpenMessenger();
              }}
              onOpenSystemUser={
                onOpenSystemUser
                  ? () => {
                      flushSync(() => setShowDiagnostics(false));
                      onOpenSystemUser();
                    }
                  : undefined
              }
            />
          }
          diagnostics={
            <>
              {renderPageSelector(true)}
              {pages.isLoading || detail.isLoading ? (
                <p role="status">{t('loading')}</p>
              ) : !selectedPage || !view ? (
                hasError ? (
                  errorFeedback
                ) : pages.data?.length === 0 ? (
                  <p>{t('fb_auto_no_pages')}</p>
                ) : null
              ) : (
                <FacebookDiagnostics
                  view={view}
                  pageName={selectedPage.name}
                  statusText={statusText}
                  errorText={
                    hasError
                      ? t(actionError ? actionErrorKey : 'fb_auto_error')
                      : undefined
                  }
                  feedback={
                    <>
                      {hasError && retryButton}
                      {resultFeedback}
                    </>
                  }
                  actions={
                    <>
                      <Button
                        secondary
                        disabled={busy}
                        loading={activeAction === 'authorize'}
                        loadingLabel={t('meta_action_authorizing')}
                        className="!h-9 !px-3 rounded-lg border border-newTableBorder text-sm"
                        onClick={() => perform('authorize')}
                      >
                        {t('fb_auto_reauthorize')}
                      </Button>
                      {view.systemUserConfigured && (
                        <Button
                          secondary
                          disabled={busy}
                          loading={activeAction === 'system-user'}
                          loadingLabel={t('meta_action_applying')}
                          className="!h-9 !px-3 rounded-lg border border-newTableBorder text-sm"
                          onClick={() => perform('system-user')}
                        >
                          {t(
                            view.authorization?.source === 'SYSTEM_USER'
                              ? 'fb_system_renew'
                              : 'fb_system_use'
                          )}
                        </Button>
                      )}
                    </>
                  }
                  proof={
                    <FacebookPrivateReplyTest
                      key={`${scope}:${selectedPage.id}`}
                      scope={scope}
                      integrationId={selectedPage.id}
                    />
                  }
                />
              )}
            </>
          }
        />
      )}
    </section>
  );
}

export function FacebookAutomationSetup({
  credentialVersion,
  onOpenMessenger,
  onOpenSystemUser,
  helpOpen,
  onHelpChange,
  helpId,
}: {
  credentialVersion: string;
  onOpenMessenger: () => void;
  onOpenSystemUser?: () => void;
  helpOpen?: boolean;
  onHelpChange?: (open: boolean) => void;
  helpId?: string;
}) {
  const user = useUser();
  if (!user?.profileId || !['ADMIN', 'SUPERADMIN'].includes(user.role))
    return null;
  const scope = `${user.orgId}:${user.profileId}:${credentialVersion}`;
  return (
    <FacebookSetupForProfile
      key={scope}
      scope={scope}
      organizationId={user.orgId}
      profileId={user.profileId}
      onOpenSystemUser={onOpenSystemUser}
      onOpenMessenger={onOpenMessenger}
      helpOpen={helpOpen}
      onHelpChange={onHelpChange}
      helpId={helpId}
    />
  );
}
