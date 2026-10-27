'use client';

import { useId, useState } from 'react';
import { Button } from '@gitroom/react/form/button';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { HelpStep } from './settings-help.component';

export function InstagramSetupGuide({
  onOpenSystemUser,
}: {
  onOpenSystemUser?: () => void;
}) {
  const t = useT();
  const id = useId();
  const [method, setMethod] = useState<'account' | 'system'>('account');

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 font-medium">
          {t('meta_instagram_guide_method')}
        </legend>
        <div className="grid grid-cols-2 gap-2">
          {(['account', 'system'] as const).map((option) => (
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
                {t(
                  option === 'account'
                    ? 'meta_instagram_guide_account'
                    : 'meta_system_tab'
                )}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {method === 'account' ? (
        <ol className="space-y-6">
          {[1, 2, 3].map((step) => (
            <HelpStep
              key={step}
              number={step}
              title={t(`meta_instagram_guide_${step}_title`)}
            >
              <p>{t(`meta_instagram_guide_${step}_text`)}</p>
            </HelpStep>
          ))}
        </ol>
      ) : (
        <>
          <div className="space-y-2 rounded-lg border border-newTableBorder bg-newBgColor p-3">
            <p className="font-medium">{t('meta_instagram_system_support')}</p>
            <p className="text-newTextColor/70">
              {t('meta_instagram_system_limit')}
            </p>
          </div>
          <ol className="space-y-6">
            <HelpStep number={1} title={t('meta_instagram_system_assets_title')}>
              <p>{t('meta_instagram_system_assets_text')}</p>
            </HelpStep>
            <HelpStep number={2} title={t('meta_instagram_system_save_title')}>
              <p>{t('meta_instagram_system_save_text')}</p>
              {onOpenSystemUser && (
                <Button
                  secondary
                  className="rounded-lg border border-newTableBorder text-sm"
                  onClick={onOpenSystemUser}
                >
                  {t('fb_system_open')}
                </Button>
              )}
            </HelpStep>
          </ol>
        </>
      )}
    </div>
  );
}
