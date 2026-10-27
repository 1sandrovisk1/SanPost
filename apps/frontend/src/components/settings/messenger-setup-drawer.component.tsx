'use client';

import { flushSync } from 'react-dom';
import { Button } from '@gitroom/react/form/button';
import { MetaCopyField } from './meta-copy-field.component';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { SettingsHelpDrawer, HelpStep } from './settings-help.component';
import {
  DiagnosticSummary,
  DiagnosticField,
  DiagnosticDetails,
  DiagnosticIdentifier,
} from './meta-diagnostics.component';

export function MessengerSetupDrawer({
  id,
  appId,
  authorizationRequired,
  callbackUrl,
  verifyToken,
  onOpenFacebook,
  onClose,
}: {
  id: string;
  appId: string;
  authorizationRequired: boolean;
  callbackUrl: string;
  verifyToken: string | null;
  onOpenFacebook: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const openFacebook = () => {
    flushSync(onClose);
    onOpenFacebook();
  };

  return (
    <SettingsHelpDrawer
      id={id}
      network="Messenger"
      onClose={onClose}
      diagnostics={
        <>
          <DiagnosticSummary
            title={t('meta_diagnostic_webhook_title')}
            status={t('meta_diagnostic_webhook_unverified')}
          >
            <dl>
              <DiagnosticField label={t('meta_diagnostic_webhook_values')}>
                {t(
                  authorizationRequired
                    ? 'meta_messenger_needs_page'
                    : 'meta_messenger_values_available'
                )}
              </DiagnosticField>
            </dl>
            <p className="text-sm text-newTextColor/70">
              {t('meta_messenger_diagnostic_scope')}
            </p>
          </DiagnosticSummary>
          <p className="text-sm text-newTextColor/70">
            {t('meta_messenger_diagnostic_check')}
          </p>
          <Button
            secondary
            className="rounded-lg border border-newTableBorder text-sm"
            onClick={openFacebook}
          >
            {t('meta_diagnostic_open_facebook')}
          </Button>
          <DiagnosticDetails>
            <DiagnosticIdentifier
              label={t('meta_diagnostic_app_id')}
              value={appId}
            />
          </DiagnosticDetails>
        </>
      }
      guide={
        <>
          <p className="text-newTextColor/70">
            {t('fb_auto_shared_webhook_notice')}
          </p>
          <ol aria-label={t('fb_auto_setup_steps')} className="space-y-6">
            <HelpStep number={1} title={t('fb_auto_step_open')}>
              <a
                href={`https://developers.facebook.com/apps/${appId}/dashboard/`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex rounded-lg border border-newTableBorder px-3 py-2 font-medium text-newTextColor focus-visible:ring-2 focus-visible:ring-btnPrimary"
              >
                {t('fb_auto_meta_open_short')} <span aria-hidden="true">↗</span>
              </a>
              <details>
                <summary className="cursor-pointer">
                  {t('fb_auto_meta_path_help')}
                </summary>
                <p className="mt-2">{t('fb_auto_meta_path')}</p>
              </details>
            </HelpStep>
            <HelpStep number={2} title={t('messenger_guide_copy_title')}>
              {authorizationRequired || !verifyToken ? (
                <>
                  <p>{t('messenger_authorization_hint')}</p>
                  <Button
                    secondary
                    className="rounded-lg border border-newTableBorder text-sm"
                    onClick={openFacebook}
                  >
                    {t('messenger_authorize_facebook')}
                  </Button>
                </>
              ) : (
                <>
                  <MetaCopyField
                    label={t('fb_auto_callback')}
                    value={callbackUrl}
                  />
                  <MetaCopyField
                    label={t('fb_auto_verify')}
                    value={verifyToken}
                    secret
                  />
                </>
              )}
            </HelpStep>
            <HelpStep number={3} title={t('messenger_guide_subscribe_title')}>
              <p>{t('messenger_guide_copy_text')}</p>
            </HelpStep>
            <HelpStep number={4} title={t('messenger_guide_page_title')}>
              <p>{t('messenger_guide_page_text')}</p>
              <Button
                secondary
                className="rounded-lg border border-newTableBorder text-sm"
                onClick={openFacebook}
              >
                {t('messenger_manage_pages')}
              </Button>
            </HelpStep>
          </ol>
        </>
      }
    />
  );
}
