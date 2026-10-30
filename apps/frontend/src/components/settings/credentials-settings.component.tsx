'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useCredentialsList } from '@gitroom/frontend/hooks/use-credentials.hook';
import { useZernioSettings } from '@gitroom/frontend/hooks/use-zernio-settings.hook';
import { ProviderCredentialForm } from '@gitroom/frontend/components/settings/provider-credential-form.component';
import { MetaCredentialsCard } from '@gitroom/frontend/components/settings/meta-credentials.component';
import { ZernioCredentialsCard } from '@gitroom/frontend/components/settings/zernio-settings.component';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useCurrentProfile } from '@gitroom/frontend/hooks/use-current-profile.hook';
import ShareProviderCredentialsComponent from '@gitroom/frontend/components/settings/share-provider-credentials.component';
import clsx from 'clsx';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface CallbackPathEntry {
  label?: string;
  path: string;
}

interface ProviderConfig {
  provider: string;
  label: string;
  iconUrl: string;
  // placeholderKey: chave i18n do placeholder (o texto fixo vira o fallback)
  fields: {
    key: string;
    label: string;
    placeholder: string;
    placeholderKey?: string;
  }[];
  docsUrl: string;
  callbackPaths?: CallbackPathEntry[];
  // orientacao curta exibida acima do formulario (chave i18n + fallback)
  hint?: { key: string; fallback: string };
}

const PROVIDERS: ProviderConfig[] = [
  {provider:'tumblr',label:'Tumblr',iconUrl:'/icons/platforms/tumblr.png',fields:[{key:'clientId',label:'OAuth Consumer Key',placeholder:'Tumblr OAuth Consumer Key',placeholderKey:'credentials_tumblr_id'},{key:'clientSecret',label:'OAuth Consumer Secret',placeholder:'Tumblr OAuth Consumer Secret',placeholderKey:'credentials_tumblr_secret'}],docsUrl:'https://www.tumblr.com/oauth/apps',callbackPaths:[{path:'/integrations/social/tumblr'}],hint:{key:'credentials_tumblr_hint',fallback:'Create an OAuth app in Tumblr and register this callback URL. Credentials apply to the active profile.'}},
  {
    provider: 'tiktok',
    label: 'TikTok',
    iconUrl: '/icons/platforms/tiktok.png',
    fields: [
      {
        key: 'clientId',
        label: 'Client Key',
        placeholder: 'Cole o Client Key do TikTok',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Cole o Client Secret do TikTok',
      },
    ],
    docsUrl: 'https://developers.tiktok.com',
    callbackPaths: [{ path: '/integrations/social/tiktok' }],
  },
  {
    // canal tiktok-business: app proprio da TikTok API for Business, separado
    // do app do TikTok (Login Kit / Content Posting API) acima
    provider: 'tiktok-business',
    label: 'TikTok Business',
    iconUrl: '/icons/platforms/tiktok-business.png',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID (App ID)',
        placeholder: 'Paste the TikTok for Business app Client ID',
        placeholderKey: 'credentials_tiktok_business_app_id_placeholder',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Paste the TikTok for Business app Client Secret',
        placeholderKey: 'credentials_tiktok_business_secret_placeholder',
      },
    ],
    docsUrl: 'https://business-api.tiktok.com/portal',
    // o portal do TikTok for Business so aceita o redirect com a barra final
    callbackPaths: [{ path: '/integrations/social/tiktok-business/' }],
    hint: {
      key: 'credentials_tiktok_business_hint',
      fallback:
        'Use the app created in the TikTok API for Business portal (not the TikTok for Developers app). Register the callback URL exactly as shown below, including the trailing slash.',
    },
  },
  {
    provider: 'pinterest',
    label: 'Pinterest',
    iconUrl: '/icons/platforms/pinterest.png',
    fields: [
      {
        key: 'clientId',
        label: 'App ID',
        placeholder: 'Cole o App ID do Pinterest',
      },
      {
        key: 'clientSecret',
        label: 'App Secret',
        placeholder: 'Cole o App Secret do Pinterest',
      },
    ],
    docsUrl: 'https://developers.pinterest.com',
    callbackPaths: [{ path: '/integrations/social/pinterest' }],
  },
  {
    provider: 'linkedin',
    label: 'LinkedIn',
    iconUrl: '/icons/platforms/linkedin.png',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'Cole o Client ID do LinkedIn',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Cole o Client Secret do LinkedIn',
      },
    ],
    docsUrl: 'https://www.linkedin.com/developers',
    callbackPaths: [
      { label: 'Perfil pessoal', path: '/integrations/social/linkedin' },
      { label: 'Página da empresa', path: '/integrations/social/linkedin-page' },
    ],
  },
  {
    provider: 'twitter',
    label: 'Twitter / X',
    iconUrl: '/icons/platforms/x.png',
    fields: [
      {
        key: 'clientId',
        label: 'Consumer Key',
        placeholder: 'Cole a Consumer Key do X',
      },
      {
        key: 'clientSecret',
        label: 'Access Token',
        placeholder: 'Cole o Access Token do X',
      },
    ],
    docsUrl: 'https://developer.twitter.com',
    callbackPaths: [{ path: '/integrations/social/x' }],
  },
  {
    provider: 'youtube',
    label: 'YouTube / Google',
    iconUrl: '/icons/platforms/youtube.png',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'Cole o Client ID do Google',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Cole o Client Secret do Google',
      },
    ],
    docsUrl: 'https://console.cloud.google.com',
    callbackPaths: [{ path: '/integrations/social/youtube' }],
  },
  {
    provider: 'reddit',
    label: 'Reddit',
    iconUrl: '/icons/platforms/reddit.png',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'Cole o Client ID do Reddit',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Cole o Client Secret do Reddit',
      },
    ],
    docsUrl: 'https://www.reddit.com/prefs/apps',
    callbackPaths: [{ path: '/integrations/social/reddit' }],
  },
  {
    provider: 'discord',
    label: 'Discord',
    iconUrl: '/icons/platforms/discord.png',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'Cole o Client ID do Discord',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Cole o Client Secret do Discord',
      },
      {
        key: 'botToken',
        label: 'Bot Token',
        placeholder: 'Cole o Bot Token do Discord',
      },
    ],
    docsUrl: 'https://discord.com/developers',
    callbackPaths: [{ path: '/integrations/social/discord' }],
  },
  {
    provider: 'slack',
    label: 'Slack',
    iconUrl: '/icons/platforms/slack.png',
    fields: [
      {
        key: 'clientId',
        label: 'Client ID',
        placeholder: 'Cole o Client ID do Slack',
      },
      {
        key: 'clientSecret',
        label: 'Client Secret',
        placeholder: 'Cole o Client Secret do Slack',
      },
      {
        key: 'signingSecret',
        label: 'Signing Secret',
        placeholder: 'Cole o Signing Secret do Slack',
      },
    ],
    docsUrl: 'https://api.slack.com',
    callbackPaths: [{ path: '/integrations/social/slack' }],
  },
];

const ProviderCard: React.FC<{
  config: ProviderConfig;
  configured: boolean;
  onMutate: () => void;
}> = ({ config, configured, onMutate }) => {
  const [expanded, setExpanded] = useState(false);
  const { frontEndUrl } = useVariables();
  const t = useT();

  const fields = useMemo(
    () =>
      config.fields.map(({ placeholderKey, ...field }) => ({
        ...field,
        placeholder: placeholderKey
          ? t(placeholderKey, field.placeholder)
          : field.placeholder,
      })),
    [config.fields, t]
  );

  const callbacks = useMemo(() => {
    if (!config.callbackPaths || config.callbackPaths.length === 0)
      return undefined;
    const base =
      frontEndUrl ||
      (typeof window !== 'undefined' ? window.location.origin : '');
    if (!base) return undefined;
    const trimmed = base.replace(/\/$/, '');
    return config.callbackPaths.map((cb) => ({
      label: cb.label,
      url: `${trimmed}${cb.path}`,
    }));
  }, [frontEndUrl, config.callbackPaths]);

  const toggle = useCallback(() => {
    setExpanded((prev) => !prev);
  }, []);

  return (
    <div className="bg-sixth border-fifth border rounded-[4px] overflow-hidden">
      <div
        className="flex items-center justify-between p-[16px] cursor-pointer hover:bg-boxHover transition-colors"
        onClick={toggle}
      >
        <div className="flex items-center gap-[12px]">
          <img
            src={config.iconUrl}
            alt={config.label}
            className="w-[24px] h-[24px] object-contain"
          />
          <div className="text-[15px] font-[500]">{config.label}</div>
          {configured ? (
            <span className="inline-flex items-center gap-[6px] rounded-full bg-customColor42/20 text-customColor42 px-[10px] py-[2px] text-[12px]">
              <span className="w-[6px] h-[6px] rounded-full bg-customColor42 inline-block" />
              Configurado
            </span>
          ) : (
            <span className="inline-flex items-center gap-[6px] rounded-full bg-fifth px-[10px] py-[2px] text-[12px] text-customColor18">
              Usando variável de ambiente
            </span>
          )}
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={clsx(
            'transition-transform',
            expanded && 'rotate-180'
          )}
        >
          <path
            d="M4 6L8 10L12 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      {expanded && (
        <div className="border-t border-fifth p-[16px]">
          {config.hint && (
            <div className="text-[13px] text-customColor18 mb-[12px]">
              {t(config.hint.key, config.hint.fallback)}
            </div>
          )}
          <ProviderCredentialForm
            provider={config.provider}
            fields={fields}
            label={config.label}
            docsUrl={config.docsUrl}
            callbacks={callbacks}
            onSaved={onMutate}
            onDeleted={onMutate}
          />
        </div>
      )}
    </div>
  );
};

export const CredentialsSettingsSection: React.FC = () => {
  const { data, isLoading, mutate } = useCredentialsList();
  const { data: zernio, mutate: mutateZernio } = useZernioSettings();
  const { profile: currentProfile } = useCurrentProfile();

  const handleMutate = useCallback(() => {
    mutate();
    mutateZernio();
  }, [mutate, mutateZernio]);

  if (isLoading) {
    return (
      <div className="my-[16px] mt-[16px] bg-sixth border-fifth border rounded-[4px] p-[24px]">
        <div className="animate-pulse">Carregando...</div>
      </div>
    );
  }

  const configuredMap = new Map(
    (data || []).map((c) => [c.provider, c.configured])
  );

  return (
    <div className="flex flex-col">
      <h3 className="text-[20px]">Credenciais de Apps</h3>
      <div className="text-customColor18 mt-[4px]">
        Configure as credenciais OAuth de cada rede social para seu workspace.
        Isso permite que cada workspace use seus próprios apps em vez das
        variáveis de ambiente globais.
      </div>
      {currentProfile?.isDefault && <ShareProviderCredentialsComponent />}
      <div className="my-[16px] mt-[16px] flex flex-col gap-[8px]">
        <MetaCredentialsCard
          configured={configuredMap.get('facebook') || false}
          onMutate={handleMutate}
        />
        {PROVIDERS.map((config) => (
          <ProviderCard
            key={config.provider}
            config={config}
            configured={configuredMap.get(config.provider) || false}
            onMutate={handleMutate}
          />
        ))}
        <ZernioCredentialsCard
          configured={zernio?.configured ?? false}
          onMutate={handleMutate}
        />
      </div>
    </div>
  );
};

export default CredentialsSettingsSection;
