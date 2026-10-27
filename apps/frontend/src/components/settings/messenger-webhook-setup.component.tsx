'use client';

import { useId, useState } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import type { FacebookAppWebhookView } from '@gitroom/nestjs-libraries/dtos/integrations/facebook-automation.dto';
import {
  SettingsHelpButton,
  SettingsHelpDrawer,
} from './settings-help.component';
import { MessengerSetupDrawer } from './messenger-setup-drawer.component';
import { MetaCopyField } from './meta-copy-field.component';
import { FacebookHelp } from './facebook-help.component';

function useAppWebhook(scope: string) {
  const fetchApi = useFetch();
  return useSWR<FacebookAppWebhookView, Error>(
    [scope, '/facebook-automations/app/webhook'],
    async () => {
      const response = await fetchApi('/facebook-automations/app/webhook', {
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(
          response.status === 412 ? 'PREREQUISITE' : 'UNAVAILABLE'
        );
      return response.json();
    },
    {
      revalidateOnMount: true,
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      keepPreviousData: false,
    }
  );
}

function MessengerWebhookForProfile({
  scope,
  onOpenFacebook,
  helpOpen,
  onHelpChange,
  helpId,
}: {
  scope: string;
  onOpenFacebook: () => void;
  helpOpen?: boolean;
  onHelpChange?: (open: boolean) => void;
  helpId?: string;
}) {
  const t = useT();
  const {
    data: view,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useAppWebhook(scope);
  const [localHelpOpen, setLocalHelpOpen] = useState(false);
  const guideOpen = helpOpen ?? localHelpOpen;
  const setGuideOpen = onHelpChange ?? setLocalHelpOpen;
  const localGuideId = useId();
  const guideId = helpId ?? localGuideId;
  return (
    <section
      className="space-y-5 text-sm leading-relaxed"
      aria-label={t('messenger_webhook_heading')}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <h3 className="font-semibold">{t('messenger_config_heading')}</h3>
          <FacebookHelp
            label={t('messenger_app_help_label')}
            text={t('messenger_app_help')}
          />
        </div>
        {!onHelpChange && !error && !isLoading && view && (
          <SettingsHelpButton
            open={guideOpen}
            drawerId={guideId}
            onClick={() => setGuideOpen(true)}
          />
        )}
      </div>
      {isLoading && <p role="status">{t('loading')}</p>}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-3"
        >
          <p>
            {t(
              error.message === 'PREREQUISITE'
                ? 'messenger_prerequisite'
                : 'fb_auto_error'
            )}
          </p>
          <div className="flex flex-wrap gap-3">
            <Button secondary onClick={onOpenFacebook}>
              {t('messenger_back_facebook')}
            </Button>
            <Button
              secondary
              loading={isValidating}
              loadingLabel={t('meta_action_loading')}
              onClick={() => void mutate().catch(() => undefined)}
            >
              {t('fb_auto_retry')}
            </Button>
          </div>
        </div>
      )}
      {!error && !isLoading && view && (
        <>
          {view.authorizationRequired || !view.verifyToken ? (
            <div className="space-y-3">
              <p>{t('messenger_authorization_hint')}</p>
              <Button onClick={onOpenFacebook}>
                {t('messenger_authorize_facebook')}
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <MetaCopyField
                label={t('fb_auto_callback')}
                value={view.callbackUrl}
                help={
                  <FacebookHelp
                    label={t('messenger_callback_help_label')}
                    text={t('messenger_callback_help')}
                  />
                }
              />
              <MetaCopyField
                label={t('fb_auto_verify')}
                value={view.verifyToken}
                secret
                help={
                  <FacebookHelp
                    label={t('fb_auto_verify_help_label')}
                    text={t('fb_auto_verify_help')}
                  />
                }
              />
              <Button
                secondary
                className="rounded-lg border border-newTableBorder text-sm focus-visible:ring-2 focus-visible:ring-btnPrimary"
                onClick={onOpenFacebook}
              >
                {t('messenger_manage_pages')}
              </Button>
            </div>
          )}
        </>
      )}
      {guideOpen && (error || !view) && (
        <SettingsHelpDrawer
          id={guideId}
          network="Messenger"
          onClose={() => setGuideOpen(false)}
          guide={
            <>
              <p>{t('fb_auto_meta_path')}</p>
              <p>{t('fb_auto_shared_webhook_notice')}</p>
            </>
          }
          diagnostics={
            <p>
              {t(
                error?.message === 'PREREQUISITE'
                  ? 'messenger_prerequisite'
                  : error
                  ? 'fb_auto_error'
                  : 'loading'
              )}
            </p>
          }
        />
      )}
      {guideOpen && !error && view && (
        <MessengerSetupDrawer
          id={guideId}
          appId={view.appId}
          callbackUrl={view.callbackUrl}
          verifyToken={view.verifyToken}
          onOpenFacebook={onOpenFacebook}
          authorizationRequired={
            view.authorizationRequired || !view.verifyToken
          }
          onClose={() => setGuideOpen(false)}
        />
      )}
    </section>
  );
}

export function MessengerWebhookSetup({
  credentialVersion,
  onOpenFacebook,
  helpOpen,
  onHelpChange,
  helpId,
}: {
  credentialVersion: string;
  onOpenFacebook: () => void;
  helpOpen?: boolean;
  onHelpChange?: (open: boolean) => void;
  helpId?: string;
}) {
  const user = useUser();
  if (!user?.profileId || !['ADMIN', 'SUPERADMIN'].includes(user.role))
    return null;
  const scope = `${user.orgId}:${user.profileId}:${credentialVersion}`;
  return (
    <MessengerWebhookForProfile
      key={scope}
      scope={scope}
      onOpenFacebook={onOpenFacebook}
      helpOpen={helpOpen}
      onHelpChange={onHelpChange}
      helpId={helpId}
    />
  );
}
