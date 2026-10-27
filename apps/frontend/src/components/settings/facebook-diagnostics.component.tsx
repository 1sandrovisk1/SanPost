'use client';

import type { ReactNode } from 'react';
import {
  useT,
  useTranslationSettings,
} from '@gitroom/react/translation/get.transation.service.client';
import type { FacebookSetupView } from '@gitroom/nestjs-libraries/dtos/integrations/facebook-automation.dto';
import { facebookSetupDateOptions } from './facebook-automation-dates';
import {
  DiagnosticSummary,
  DiagnosticSection,
  DiagnosticField,
  DiagnosticDetails,
  DiagnosticIdentifier,
} from './meta-diagnostics.component';

export function FacebookDiagnostics({
  view,
  pageName,
  statusText,
  errorText,
  actions,
  feedback,
  proof,
}: {
  view: FacebookSetupView;
  pageName: string;
  statusText: string;
  errorText?: string;
  actions: ReactNode;
  feedback: ReactNode;
  proof: ReactNode;
}) {
  const t = useT();
  const { resolvedLanguage } = useTranslationSettings();
  const date = (value?: string | null) =>
    value
      ? facebookSetupDateOptions(value, resolvedLanguage).time
      : t('meta_diagnostic_not_available');
  const expiry = (value?: string | null, noExpiry?: boolean) =>
    value
      ? date(value)
      : t(
          noExpiry === true
            ? 'meta_diagnostic_no_expiry'
            : 'meta_diagnostic_not_available'
        );
  const { status, authorization, receipt } = view;
  return (
    <>
      <DiagnosticSummary
        title={pageName}
        status={errorText ? undefined : statusText}
      >
        {errorText && <p role="alert">{errorText}</p>}
        {!!status?.missingPermissions.length && (
          <p className="text-sm">
            {t('fb_auto_missing', {
              permissions: status.missingPermissions.join(', '),
            })}
          </p>
        )}
        <dl>
          <DiagnosticField label={t('meta_diagnostic_page_checked')}>
            {date(status?.checkedAt)}
          </DiagnosticField>
          {status?.stage === 'CHECK_FAILED' && status.lastReadyAt && (
            <DiagnosticField label={t('meta_diagnostic_last_ready')}>
              {date(status.lastReadyAt)}
            </DiagnosticField>
          )}
        </dl>
      </DiagnosticSummary>
      <DiagnosticSection title={t('meta_diagnostic_authorization')}>
        <dl>
          {view.authorized && (
            <>
              <DiagnosticField label={t('meta_diagnostic_method')}>
                {t(
                  authorization?.source === 'SYSTEM_USER'
                    ? 'meta_system_tab'
                    : 'fb_guide_login'
                )}
              </DiagnosticField>
              {authorization?.authorizedAt && (
                <DiagnosticField label={t('meta_diagnostic_authorized_at')}>
                  {date(authorization.authorizedAt)}
                </DiagnosticField>
              )}
            </>
          )}
          {/* The Page token is distinct from its source system-user token. */}
          <DiagnosticField label={t('meta_diagnostic_page_expiry')}>
            {expiry(status?.tokenExpiresAt, status?.noScheduledExpiry)}
          </DiagnosticField>
          {status?.dataAccessExpiresAt && (
            <DiagnosticField label={t('meta_diagnostic_page_data_expiry')}>
              {date(status.dataAccessExpiresAt)}
            </DiagnosticField>
          )}
        </dl>
        <p className="text-xs text-newTextColor/60">
          {t('meta_diagnostic_revocation')}
        </p>
        {view.authorized && (
          <div className="flex flex-wrap gap-2">{actions}</div>
        )}
        {feedback}
      </DiagnosticSection>
      <DiagnosticSection title={t('meta_diagnostic_activity')}>
        {receipt ? (
          <dl>
            <DiagnosticField label={t('meta_diagnostic_last_comment')}>
              {date(receipt.receivedAt)}
            </DiagnosticField>
          </dl>
        ) : (
          <p className="text-sm text-newTextColor/70">
            {t('meta_diagnostic_no_comments')}
          </p>
        )}
      </DiagnosticSection>
      <DiagnosticDetails>
        <DiagnosticIdentifier
          label={t('meta_diagnostic_app_id')}
          value={view.appId}
        />
        <DiagnosticIdentifier
          label={t('meta_diagnostic_page_id')}
          value={view.pageId}
        />
        {receipt && (
          <>
            <DiagnosticIdentifier
              label={t('meta_diagnostic_post_id')}
              value={receipt.postId}
            />
            <DiagnosticIdentifier
              label={t('meta_diagnostic_comment_id')}
              value={receipt.commentId}
            />
          </>
        )}
        {view.authorized && authorization?.source === 'SYSTEM_USER' && (
          <section className="space-y-2">
            <h4 className="font-medium">{t('meta_diagnostic_source_token')}</h4>
            <p className="text-xs text-newTextColor/60">
              {t('meta_diagnostic_source_notice')}
            </p>
            <dl>
              <DiagnosticField label={t('meta_diagnostic_authorized_at')}>
                {date(authorization.authorizedAt)}
              </DiagnosticField>
              <DiagnosticField label={t('meta_diagnostic_source_expiry')}>
                {expiry(
                  authorization.tokenExpiresAt,
                  authorization.noScheduledExpiry
                )}
              </DiagnosticField>
              {authorization.dataAccessExpiresAt && (
                <DiagnosticField
                  label={t('meta_diagnostic_source_data_expiry')}
                >
                  {date(authorization.dataAccessExpiresAt)}
                </DiagnosticField>
              )}
            </dl>
          </section>
        )}
      </DiagnosticDetails>
      {view.authorized && proof}
    </>
  );
}
