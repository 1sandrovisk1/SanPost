'use client';

import { flushSync } from 'react-dom';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { FacebookSetupGuide } from './facebook-setup-guide.component';
import { InstagramSetupGuide } from './meta-instagram-guide.component';
import { SettingsHelpDrawer, HelpStep } from './settings-help.component';
import { MessagingTokensDiagnostics } from './messaging-tokens-section.component';
import { DiagnosticSummary } from './meta-diagnostics.component';

export function MetaCredentialsHelp({
  id,
  section,
  configured,
  tokensEnabled,
  onClose,
  onOpenSystemUser,
  onOpenMessenger,
}: {
  id: string;
  section: 'facebook' | 'instagram' | 'threads' | 'messenger' | 'system-user';
  configured: boolean;
  tokensEnabled: boolean;
  onClose: () => void;
  onOpenSystemUser?: () => void;
  onOpenMessenger?: () => void;
}) {
  const t = useT();
  const network =
    section === 'system-user'
      ? t('meta_system_tab', 'Usuário de sistema')
      : section === 'instagram'
      ? 'Instagram'
      : section === 'facebook'
      ? 'Facebook'
      : section === 'messenger'
      ? 'Messenger'
      : 'Threads';
  const prefix = section === 'system-user' ? 'meta_system' : `meta_${section}`;
  const links = {
    facebook: 'https://developers.facebook.com/docs/pages-api',
    messenger: 'https://developers.facebook.com/docs/messenger-platform',
    instagram:
      'https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login',
    threads: 'https://developers.facebook.com/docs/threads',
    'system-user': 'https://business.facebook.com/settings/system-users',
  };
  return (
    <SettingsHelpDrawer
      id={id}
      network={network}
      onClose={onClose}
      guide={
        <>
          {section === 'system-user' && (
            <p className="text-newTextColor/70">
              {t('meta_system_prerequisite')}
            </p>
          )}
          {section === 'facebook' ? (
            <FacebookSetupGuide
              onOpenSystemUser={
                onOpenSystemUser
                  ? () => {
                      flushSync(onClose);
                      onOpenSystemUser();
                    }
                  : undefined
              }
              onOpenMessenger={
                onOpenMessenger
                  ? () => {
                      flushSync(onClose);
                      onOpenMessenger();
                    }
                  : undefined
              }
            />
          ) : section === 'instagram' ? (
            <InstagramSetupGuide
              onOpenSystemUser={
                onOpenSystemUser
                  ? () => {
                      flushSync(onClose);
                      onOpenSystemUser();
                    }
                  : undefined
              }
            />
          ) : (
            <ol className="space-y-5">
              {[1, 2, 3].map((step) => (
                <HelpStep
                  key={step}
                  number={step}
                  title={t(`${prefix}_guide_${step}_title`)}
                >
                  <p>{t(`${prefix}_guide_${step}_text`)}</p>
                </HelpStep>
              ))}
            </ol>
          )}
          <a
            href={links[section]}
            target="_blank"
            rel="noreferrer"
            className="inline-flex rounded-lg border border-newTableBorder px-3 py-2 font-medium focus-visible:ring-2 focus-visible:ring-btnPrimary"
          >
            {t('meta_help_official')} ↗
          </a>
          {section === 'threads' && (
            <p className="text-newTextColor/70">
              {t('meta_threads_automation_limit')}
            </p>
          )}
        </>
      }
      diagnostics={
        <>
          {section !== 'system-user' && (
            <DiagnosticSummary
              title={t('meta_diagnostic_app')}
              status={t(
                configured
                  ? 'meta_diagnostic_app_saved'
                  : 'meta_diagnostic_app_missing'
              )}
            >
              {!configured && (
                <p className="text-sm text-newTextColor/70">
                  {t('meta_app_credentials_missing')}
                </p>
              )}
              {configured && (
                <p className="text-xs text-newTextColor/60">
                  {t('meta_diagnostic_app_not_validated')}
                </p>
              )}
            </DiagnosticSummary>
          )}
          {['threads', 'facebook', 'messenger'].includes(section) ? (
            <p>{t('meta_threads_diagnostic_help')}</p>
          ) : tokensEnabled ? (
            <MessagingTokensDiagnostics
              section={section === 'system-user' ? 'system-user' : 'instagram'}
            />
          ) : (
            <p>{t('meta_credentials_save_first')}</p>
          )}
        </>
      }
    />
  );
}
