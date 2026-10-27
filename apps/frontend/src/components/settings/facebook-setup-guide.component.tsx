'use client';
import { useId, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { HelpStep } from './settings-help.component';

export function FacebookSetupGuide({
  onOpenSystemUser,
  onOpenMessenger,
}: {
  onOpenSystemUser?: () => void;
  onOpenMessenger?: () => void;
}) {
  const t = useT();
  const id = useId();
  const [method, setMethod] = useState<'login' | 'system'>('login');
  const secondary = 'rounded-lg border border-newTableBorder text-sm';
  return (
    <div className="space-y-5">
      <p className="text-newTextColor/70">{t('fb_guide_prerequisite')}</p>
      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">{t('fb_guide_method')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['login', 'system'] as const).map((option) => (
            <label
              key={option}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border p-3 ${
                method === option
                  ? 'border-btnPrimary bg-newBgColor'
                  : 'border-newTableBorder'
              }`}
            >
              <input
                type="radio"
                name={id}
                value={option}
                checked={method === option}
                onChange={() => setMethod(option)}
                className="accent-btnPrimary"
              />
              <span>
                {t(option === 'login' ? 'fb_guide_login' : 'meta_system_tab')}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <ol aria-label={t('fb_auto_setup_steps')} className="space-y-6">
        <HelpStep
          number={1}
          title={t(
            method === 'login'
              ? 'fb_guide_authorize_title'
              : 'fb_guide_system_title'
          )}
        >
          <p>
            {t(
              method === 'login'
                ? 'fb_guide_login_authorize'
                : 'fb_guide_system_token'
            )}
          </p>
          {method === 'system' && (
            <>
              <details>
                <summary className="cursor-pointer font-medium text-newTextColor">
                  {t('fb_guide_permissions')}
                </summary>
                <p className="mt-2 break-words text-xs">
                  pages_messaging, pages_manage_metadata, pages_read_engagement,
                  pages_read_user_content, pages_manage_engagement.
                </p>
              </details>
              {onOpenSystemUser && (
                <Button
                  secondary
                  className={secondary}
                  onClick={onOpenSystemUser}
                >
                  {t('fb_system_open')}
                </Button>
              )}
            </>
          )}
        </HelpStep>
        <HelpStep number={2} title={t('fb_guide_webhook_title')}>
          <p>{t('fb_guide_shared_webhook')}</p>
          {onOpenMessenger && (
            <Button secondary className={secondary} onClick={onOpenMessenger}>
              {t('fb_auto_open_messenger')}
            </Button>
          )}
        </HelpStep>
        <HelpStep number={3} title={t('fb_guide_activate_title')}>
          <p>{t('fb_guide_activate')}</p>
        </HelpStep>
      </ol>
    </div>
  );
}
