'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCredential } from '@gitroom/frontend/hooks/use-credentials.hook';
import { Button } from '@gitroom/react/form/button';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { useDecisionModal } from '@gitroom/frontend/components/layout/new-modal';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import {
  MessagingTokensProvider,
  MessagingTokensSection,
} from '@gitroom/frontend/components/settings/messaging-tokens-section.component';
import { FacebookAutomationSetup } from './facebook-automation-setup.component';
import { MessengerWebhookSetup } from './messenger-webhook-setup.component';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { MetaActionFeedback } from './meta-action-feedback.component';
import { MetaCopyField, MetaCopyButton } from './meta-copy-field.component';
import { SettingsHelpButton } from './settings-help.component';
import { MetaCredentialsHelp } from './meta-credentials-help.component';
import { FacebookHelp } from './facebook-help.component';
import { useSearchParams } from 'next/navigation';

const PROVIDER = 'facebook';
const SENTINEL = '__REDACTED__';
const MASK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';
const DEFAULT_VERIFY_TOKEN = 'multipost';

type SectionId = 'facebook' | 'instagram' | 'threads';
type TabId = SectionId | 'messenger' | 'system-user';

type FieldKey =
  | 'clientId'
  | 'clientSecret'
  | 'instagramAppId'
  | 'instagramAppSecret'
  | 'webhookVerifyToken'
  | 'threadsAppId'
  | 'threadsAppSecret';

const ALL_FIELDS: FieldKey[] = [
  'clientId',
  'clientSecret',
  'instagramAppId',
  'instagramAppSecret',
  'webhookVerifyToken',
  'threadsAppId',
  'threadsAppSecret',
];

const FIELDS_BY_SECTION: Record<SectionId, FieldKey[]> = {
  facebook: ['clientId', 'clientSecret'],
  instagram: ['instagramAppId', 'instagramAppSecret', 'webhookVerifyToken'],
  threads: ['threadsAppId', 'threadsAppSecret'],
};

interface Props {
  configured: boolean;
  onMutate: () => void;
}

const PencilIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M11.3 2.7a1 1 0 0 1 1.4 0l.6.6a1 1 0 0 1 0 1.4L5.4 12.6l-2.4.4.4-2.4L11.3 2.7Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const PlugIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M5 2v3M11 2v3M4 5h8v3a4 4 0 0 1-8 0V5Zm4 8v2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const TrashIcon: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M2.5 4h11M6 4V2.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 .5.5V4m2 0v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4h8Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const Spinner: React.FC = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 16 16"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="animate-spin"
  >
    <circle
      cx="8"
      cy="8"
      r="6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeOpacity="0.3"
    />
    <path
      d="M14 8a6 6 0 0 0-6-6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const LabeledInput: React.FC<{
  label: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  onCopy?: () => Promise<void>;
}> = ({ label, placeholder, value, onChange, onCopy }) => (
  <div className="flex flex-col gap-[6px]">
    <div className="text-[13px] text-customColor18">{label}</div>
    <div className="bg-newBgColorInner h-[42px] border-newTableBorder border rounded-[8px] text-textColor placeholder-textColor flex items-center">
      <input
        className="h-full bg-transparent outline-none flex-1 text-[14px] text-textColor px-[16px] min-w-0"
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {onCopy && <MetaCopyButton value={value} onCopy={onCopy} />}
    </div>
  </div>
);

const ReadOnlyRow: React.FC<{ label: string; value?: string }> = ({
  label,
  value,
}) => (
  <div className="flex flex-col gap-[4px]">
    <div className="text-[13px] text-customColor18">{label}</div>
    <div className="text-[14px]">{value ?? MASK}</div>
  </div>
);

const IconButton: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  label: string;
  icon: React.ReactNode;
  variant?: 'default' | 'danger';
}> = ({ onClick, disabled, busy, label, icon, variant = 'default' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-busy={busy}
    title={label}
    aria-label={label}
    className={clsx(
      'flex items-center gap-[4px] text-[12px] whitespace-nowrap px-[8px] py-[4px] rounded-[4px] transition-opacity',
      disabled && 'opacity-40 cursor-not-allowed',
      !disabled && variant === 'default' && 'text-btnPrimary hover:opacity-80',
      !disabled && variant === 'danger' && 'text-customColor19 hover:opacity-80'
    )}
  >
    {icon}
    {label}
  </button>
);

const ProductSection: React.FC<{
  sectionId: TabId;
  activeSection: TabId;
  heading?: React.ReactNode;
  help?: React.ReactNode;
  description?: string;
  sectionConfigured?: boolean;
  showActionButtons?: boolean;
  isEditing?: boolean;
  canEdit?: boolean;
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  onTest?: () => void;
  onRemove?: () => void;
  saving?: boolean;
  testing?: boolean;
  removing?: boolean;
  feedback?: { key: string; error?: boolean } | null;
  testResult?: { ok: boolean; error?: string } | null;
  editLabel?: string;
  saveLabel?: string;
  cancelLabel?: string;
  testLabel?: string;
  removeLabel?: string;
  testOkLabel?: string;
  testFailLabel?: string;
  children: React.ReactNode;
}> = ({
  sectionId,
  activeSection,
  heading,
  help,
  description,
  sectionConfigured,
  showActionButtons,
  isEditing,
  canEdit,
  onEdit,
  onSave,
  onCancel,
  onTest,
  onRemove,
  saving,
  testing,
  removing,
  feedback,
  testResult,
  editLabel = 'Editar',
  saveLabel = 'Salvar',
  cancelLabel = 'Cancelar',
  testLabel = 'Testar',
  removeLabel = 'Remover',
  testOkLabel = 'Conexão OK',
  testFailLabel = 'Falha na conexão',
  children,
}) => {
  const t = useT();
  return (
    <div
      id={
        sectionId === 'instagram' ? 'meta-instagram' : `meta-panel-${sectionId}`
      }
      role="tabpanel"
      aria-labelledby={`meta-tab-${sectionId}`}
      hidden={activeSection !== sectionId}
      tabIndex={0}
      className={clsx(
        activeSection === sectionId ? 'flex' : 'hidden',
        'min-w-0 scroll-mt-6 flex-col gap-[12px] bg-newBgColorInner border border-newTableBorder rounded-b-[8px] p-[16px] focus-visible:ring-2 focus-visible:ring-btnPrimary'
      )}
    >
      {(heading ||
        description ||
        help ||
        (showActionButtons && !isEditing)) && (
        <div className="flex flex-wrap items-start justify-between gap-[12px]">
          {heading ||
            (description && (
              <div className="min-w-0 flex-1 text-[12px] text-newTextColor/70">
                {description}
              </div>
            ))}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {showActionButtons && !isEditing && (
              <div className="ml-auto flex min-w-0 flex-wrap items-center gap-[4px]">
                {sectionConfigured && onTest && (
                  <IconButton
                    onClick={onTest}
                    disabled={!canEdit || testing}
                    busy={testing}
                    label={testing ? t('meta_action_testing') : testLabel}
                    icon={testing ? <Spinner /> : <PlugIcon />}
                  />
                )}
                {onEdit && (
                  <IconButton
                    onClick={onEdit}
                    disabled={!canEdit}
                    label={editLabel}
                    icon={<PencilIcon />}
                  />
                )}
                {sectionConfigured && onRemove && (
                  <IconButton
                    onClick={onRemove}
                    disabled={!canEdit}
                    busy={removing}
                    label={removing ? t('meta_action_removing') : removeLabel}
                    icon={removing ? <Spinner /> : <TrashIcon />}
                    variant="danger"
                  />
                )}
              </div>
            )}
            {help}
          </div>
        </div>
      )}
      {feedback && (
        <MetaActionFeedback error={feedback.error}>
          {t(feedback.key)}
        </MetaActionFeedback>
      )}
      {testResult && !isEditing && (
        <MetaActionFeedback error={!testResult.ok}>
          {testResult.ok ? testOkLabel : testResult.error || testFailLabel}
        </MetaActionFeedback>
      )}
      {children}
      {isEditing && (
        <div className="flex items-center gap-[8px] pt-[4px]">
          <Button
            onClick={onSave}
            loading={saving}
            loadingLabel={t('meta_action_saving')}
          >
            {saveLabel}
          </Button>
          <Button onClick={onCancel} disabled={saving} secondary>
            {cancelLabel}
          </Button>
        </div>
      )}
    </div>
  );
};

const CopyRow = MetaCopyField;

const MetaCredentialsCardForProfile: React.FC<Props> = ({
  configured,
  onMutate,
}) => {
  const t = useT();
  const searchParams = useSearchParams();
  const fetchApi = useFetch();
  const toaster = useToaster();
  const decision = useDecisionModal();
  const { frontEndUrl } = useVariables();
  const { data, isLoading, mutate } = useCredential(PROVIDER);

  const baseUrl = React.useMemo(() => {
    const base =
      frontEndUrl ||
      (typeof window !== 'undefined' ? window.location.origin : '');
    return base ? base.replace(/\/$/, '') : '';
  }, [frontEndUrl]);
  const facebookOauthUrl = baseUrl
    ? `${baseUrl}/integrations/social/facebook`
    : '';
  const instagramOauthUrl = baseUrl
    ? `${baseUrl}/integrations/social/instagram`
    : '';
  const instagramStandaloneOauthUrl = baseUrl
    ? `${baseUrl}/integrations/social/instagram-standalone`
    : '';
  const threadsOauthUrl = baseUrl
    ? `${baseUrl}/integrations/social/threads`
    : '';

  const [expanded, setExpanded] = useState(
    !!(
      searchParams.get('facebookAutomation') ||
      searchParams.get('instagramAutomation') ||
      ['messenger', 'system-user'].includes(searchParams.get('metaTab') || '')
    )
  );
  const [activeSection, setActiveSection] = useState<TabId>(
    ['messenger', 'system-user'].includes(searchParams.get('metaTab') || '')
      ? (searchParams.get('metaTab') as TabId)
      : searchParams.get('instagramAutomation')
      ? 'instagram'
      : 'facebook'
  );
  const tabRefs = useRef<Partial<Record<TabId, HTMLButtonElement | null>>>({});
  const messengerTarget = searchParams.get('metaTab') === 'messenger';
  const systemTarget = searchParams.get('metaTab') === 'system-user';
  const [helpOpen, setHelpOpen] = useState(false);
  const helpId = useId();
  useEffect(() => {
    setHelpOpen(false);
  }, [activeSection, expanded]);
  const helpButton = (tab: TabId) => (
    <SettingsHelpButton
      open={helpOpen && activeSection === tab}
      drawerId={helpId}
      onClick={() => setHelpOpen(true)}
    />
  );
  const openTab = (tab: TabId) => {
    setActiveSection(tab);
    tabRefs.current[tab]?.focus();
  };
  const facebookTarget = searchParams.get('facebookAutomation');
  const instagramTarget = searchParams.get('instagramAutomation');
  const tabs: { id: TabId; label: string; icon: string }[] = [
    {
      id: 'facebook',
      label: t('meta_product_facebook', 'Facebook'),
      icon: '/icons/platforms/facebook.png',
    },
    {
      id: 'instagram',
      label: t('meta_product_instagram', 'Instagram'),
      icon: '/icons/platforms/instagram.png',
    },
    {
      id: 'threads',
      label: t('meta_product_threads', 'Threads'),
      icon: '/icons/platforms/threads.png',
    },
    {
      id: 'messenger',
      label: t('meta_product_messenger', 'Messenger'),
      icon: '/icons/platforms/messenger.svg',
    },
    {
      id: 'system-user',
      label: t('meta_system_tab', 'Usuário de sistema'),
      icon: '/icons/platforms/system-user.svg',
    },
  ];

  useEffect(() => {
    if (systemTarget) {
      setActiveSection('system-user');
      setExpanded(true);
    } else if (messengerTarget) {
      setActiveSection('messenger');
      setExpanded(true);
    } else if (instagramTarget || window.location.hash === '#meta-instagram') {
      setActiveSection('instagram');
      setExpanded(true);
    } else if (facebookTarget) {
      setActiveSection('facebook');
      setExpanded(true);
    }
  }, [facebookTarget, instagramTarget, messengerTarget, systemTarget]);
  const [editingSection, setEditingSection] = useState<SectionId | null>(null);
  const [saving, setSaving] = useState(false);
  const [initialFeedback, setInitialFeedback] = useState<{
    key: string;
    error?: boolean;
  } | null>(null);
  const [removingSection, setRemovingSection] = useState<SectionId | null>(
    null
  );
  const [feedback, setFeedback] = useState<
    Partial<Record<SectionId, { key: string; error?: boolean }>>
  >({});
  const mounted = useRef(true);
  const operation = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [testingSection, setTestingSection] = useState<SectionId | null>(null);
  const [testResults, setTestResults] = useState<
    Partial<Record<SectionId, { ok: boolean; error?: string } | null>>
  >({});
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [callbackUrl, setCallbackUrl] = useState<string>('');
  const [remoteVerifyToken, setRemoteVerifyToken] =
    useState<string>(DEFAULT_VERIFY_TOKEN);

  const sectionConfigured: Record<SectionId, boolean> = {
    facebook:
      data?.data?.clientId === SENTINEL ||
      data?.data?.clientSecret === SENTINEL,
    instagram:
      data?.data?.instagramAppId === SENTINEL ||
      data?.data?.instagramAppSecret === SENTINEL,
    threads:
      data?.data?.threadsAppId === SENTINEL ||
      data?.data?.threadsAppSecret === SENTINEL,
  };

  useEffect(() => {
    fetchApi('/flows/webhook-config')
      .then((r) => r.json())
      .then((d) => {
        const origin =
          typeof window !== 'undefined' ? window.location.origin : '';
        const url = d.callbackUrl.startsWith('http')
          ? d.callbackUrl
          : `${origin}${d.callbackUrl}`;
        setCallbackUrl(url);
        if (d.verifyToken) setRemoteVerifyToken(d.verifyToken);
      })
      .catch(() => {});
  }, [fetchApi, data]);

  const handleField = useCallback((key: FieldKey, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setFeedback({});
    setInitialFeedback(null);
  }, []);

  const startEdit = useCallback(
    (section: SectionId) => {
      setTestResults((prev) => ({ ...prev, [section]: null }));
      setFeedback((prev) => ({ ...prev, [section]: undefined }));
      const initial: Record<string, string> = {};
      for (const key of FIELDS_BY_SECTION[section]) {
        initial[key] = '';
      }
      // Pré-preenche o Verify Token com o valor atual (vindo de /webhook-config)
      // só quando a seção editada é Instagram.
      if (section === 'instagram') {
        initial.webhookVerifyToken = remoteVerifyToken;
      }
      setFormValues(initial);
      setEditingSection(section);
    },
    [remoteVerifyToken]
  );

  const cancelEdit = useCallback(() => {
    setFeedback({});
    setEditingSection(null);
    setFormValues({});
  }, []);

  const handleSaveSection = useCallback(
    async (section: SectionId) => {
      if (operation.current) return;
      operation.current = true;
      setSaving(true);
      setFeedback((prev) => ({ ...prev, [section]: undefined }));
      setTestResults((prev) => ({ ...prev, [section]: null }));
      try {
        const sectionFields = new Set<FieldKey>(FIELDS_BY_SECTION[section]);
        const body: Record<string, string> = {};
        for (const key of ALL_FIELDS) {
          if (sectionFields.has(key)) {
            const value = formValues[key];
            if (configured && (!value || value === '')) {
              body[key] = SENTINEL;
            } else {
              body[key] = value || '';
            }
          } else {
            // Campos fora da seção editada são sempre preservados
            body[key] = SENTINEL;
          }
        }
        const method = configured ? 'PATCH' : 'POST';
        const res = await fetchApi(`/credentials/${PROVIDER}`, {
          method,
          body: JSON.stringify(body),
        });
        if (!mounted.current) return;
        if (res.ok) {
          await mutate().catch(() => undefined);
          if (!mounted.current) return;
          setFeedback((prev) => ({
            ...prev,
            [section]: { key: 'credentials_saved' },
          }));
          onMutate();
          setEditingSection(null);
          setFormValues({});
          toaster.show(
            t('credentials_saved', 'Credenciais salvas com sucesso'),
            'success'
          );
        } else {
          setFeedback((prev) => ({
            ...prev,
            [section]: { key: 'credentials_save_error', error: true },
          }));
          toaster.show(
            t('credentials_save_error', 'Erro ao salvar credenciais'),
            'warning'
          );
        }
      } catch {
        if (mounted.current)
          setFeedback((prev) => ({
            ...prev,
            [section]: { key: 'credentials_save_error', error: true },
          }));
      } finally {
        operation.current = false;
        if (mounted.current) setSaving(false);
      }
    },
    [formValues, configured, fetchApi, mutate, onMutate, toaster, t]
  );

  const handleInitialSetup = useCallback(async () => {
    if (operation.current) return;
    operation.current = true;
    setSaving(true);
    setInitialFeedback(null);
    setTestResults({});
    try {
      const body: Record<string, string> = {};
      for (const key of ALL_FIELDS) {
        body[key] = formValues[key] || '';
      }
      if (!body.webhookVerifyToken) {
        body.webhookVerifyToken = DEFAULT_VERIFY_TOKEN;
      }
      const res = await fetchApi(`/credentials/${PROVIDER}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!mounted.current) return;
      if (res.ok) {
        await mutate().catch(() => undefined);
        if (!mounted.current) return;
        setInitialFeedback({ key: 'credentials_saved' });
        onMutate();
        setFormValues({});
        toaster.show(
          t('credentials_saved', 'Credenciais salvas com sucesso'),
          'success'
        );
      } else {
        setInitialFeedback({ key: 'credentials_save_error', error: true });
        toaster.show(
          t('credentials_save_error', 'Erro ao salvar credenciais'),
          'warning'
        );
      }
    } catch {
      if (mounted.current)
        setInitialFeedback({ key: 'credentials_save_error', error: true });
    } finally {
      operation.current = false;
      if (mounted.current) setSaving(false);
    }
  }, [formValues, fetchApi, mutate, onMutate, toaster, t]);

  const handleTestSection = useCallback(
    async (section: SectionId) => {
      if (operation.current) return;
      operation.current = true;
      setFeedback((prev) => ({ ...prev, [section]: undefined }));
      setTestingSection(section);
      setTestResults((prev) => ({ ...prev, [section]: null }));
      try {
        const res = await fetchApi(
          `/credentials/${PROVIDER}/test?section=${section}`,
          { method: 'POST' }
        );
        const result = await res.json().catch(() => null);
        if (!mounted.current) return;
        setTestResults((prev) => ({
          ...prev,
          [section]:
            res.ok && typeof result?.ok === 'boolean'
              ? {
                  ok: result.ok,
                  ...(!result.ok
                    ? { error: t('connection_failed', 'Falha na conexão') }
                    : {}),
                }
              : {
                  ok: false,
                  error: t('connection_test_error', 'Erro ao testar conexão'),
                },
        }));
      } catch (err) {
        if (!mounted.current) return;
        setTestResults((prev) => ({
          ...prev,
          [section]: {
            ok: false,
            error: t('connection_test_error', 'Erro ao testar conexão'),
          },
        }));
      } finally {
        operation.current = false;
        if (mounted.current) setTestingSection(null);
      }
    },
    [fetchApi, t]
  );

  const handleRemoveSection = useCallback(
    async (section: SectionId) => {
      if (operation.current) return;
      const sectionTitles: Record<SectionId, string> = {
        facebook: t('meta_product_facebook', 'Facebook'),
        instagram: t('meta_product_instagram', 'Instagram'),
        threads: t('meta_product_threads', 'Threads'),
      };
      const approved = await decision.open({
        title: t('credentials_delete_title', 'Remover credenciais?'),
        description: t(
          'meta_credentials_delete_section_description',
          'Esta ação remove as credenciais desta seção. As outras seções permanecem intactas.'
        ).replace('{{section}}', sectionTitles[section]),
        approveLabel: t('credentials_delete_approve', 'Sim, remover'),
        cancelLabel: t('credentials_delete_cancel', 'Cancelar'),
      });
      if (!approved || !mounted.current || operation.current) return;
      operation.current = true;
      setRemovingSection(section);
      setFeedback((prev) => ({ ...prev, [section]: undefined }));
      setTestResults((prev) => ({ ...prev, [section]: null }));

      const sectionFields = new Set<FieldKey>(FIELDS_BY_SECTION[section]);
      const body: Record<string, string> = {};
      for (const key of ALL_FIELDS) {
        // Fields of the section being removed → explicit empty string (clear).
        // Other fields → SENTINEL (preserve existing).
        body[key] = sectionFields.has(key) ? '' : SENTINEL;
      }

      try {
        const res = await fetchApi(`/credentials/${PROVIDER}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        if (!mounted.current) return;
        if (res.ok) {
          await mutate().catch(() => undefined);
          if (!mounted.current) return;
          setFeedback((prev) => ({
            ...prev,
            [section]: { key: 'credentials_removed' },
          }));
          onMutate();
          setTestResults((prev) => ({ ...prev, [section]: null }));
          toaster.show(
            t('credentials_removed', 'Credenciais removidas'),
            'success'
          );
        } else {
          setFeedback((prev) => ({
            ...prev,
            [section]: { key: 'credentials_remove_error', error: true },
          }));
          toaster.show(
            t('credentials_remove_error', 'Erro ao remover credenciais'),
            'warning'
          );
        }
      } catch {
        if (mounted.current)
          setFeedback((prev) => ({
            ...prev,
            [section]: { key: 'credentials_remove_error', error: true },
          }));
      } finally {
        operation.current = false;
        if (mounted.current) setRemovingSection(null);
      }
    },
    [fetchApi, mutate, onMutate, decision, toaster, t]
  );

  const copyToClipboard = (text: string) => navigator.clipboard.writeText(text);

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  // Em setup inicial (nada configurado), todas as seções aparecem como inputs
  // com um único Save global no rodapé. Depois de configurado, a edição é
  // por seção com um lápis e Save/Cancel inline.
  const isInitialSetup = !configured;
  const initialVerifyTokenValue =
    formValues.webhookVerifyToken || DEFAULT_VERIFY_TOKEN;

  return (
    <div className="bg-sixth border-fifth border rounded-[4px] overflow-hidden">
      <div
        className="flex items-center justify-between p-[16px] cursor-pointer hover:bg-boxHover transition-colors"
        onClick={toggle}
      >
        <div className="flex flex-wrap items-center gap-[12px]">
          <img
            src="/icons/platforms/meta.svg"
            alt="Meta"
            className="w-[28px] h-[20px] object-contain"
          />
          <div className="text-[15px] font-[500]">Meta</div>
          {configured ? (
            <span className="inline-flex items-center gap-[6px] rounded-full bg-customColor42/20 text-customColor42 px-[10px] py-[2px] text-[12px]">
              <span className="w-[6px] h-[6px] rounded-full bg-customColor42 inline-block" />
              {t('configured', 'Configurado')}
            </span>
          ) : (
            <span className="inline-flex items-center gap-[6px] rounded-full bg-fifth px-[10px] py-[2px] text-[12px] text-customColor18">
              {t('using_env_var', 'Usando variável de ambiente')}
            </span>
          )}
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={clsx('transition-transform', expanded && 'rotate-180')}
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
        <MessagingTokensProvider enabled={configured}>
          <div className="border-t border-fifth p-[16px] flex flex-col">
            <div className="min-w-0 overflow-x-auto">
              <div
                role="tablist"
                aria-label={t(
                  'meta_products_label',
                  'Facebook · Instagram · Threads · Messenger · Usuário de sistema'
                )}
                className="grid w-full min-w-[480px] grid-cols-5"
              >
                {tabs.map((tab, index) => (
                  <button
                    key={tab.id}
                    ref={(element) => {
                      tabRefs.current[tab.id] = element;
                    }}
                    id={`meta-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={activeSection === tab.id}
                    aria-controls={
                      tab.id === 'instagram'
                        ? 'meta-instagram'
                        : `meta-panel-${tab.id}`
                    }
                    tabIndex={activeSection === tab.id ? 0 : -1}
                    onClick={() => setActiveSection(tab.id)}
                    onKeyDown={(event) => {
                      const nextIndex =
                        event.key === 'ArrowRight'
                          ? (index + 1) % tabs.length
                          : event.key === 'ArrowLeft'
                          ? (index + tabs.length - 1) % tabs.length
                          : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                          ? tabs.length - 1
                          : null;
                      if (nextIndex === null) return;
                      event.preventDefault();
                      const nextTab = tabs[nextIndex].id;
                      setActiveSection(nextTab);
                      tabRefs.current[nextTab]?.focus();
                    }}
                    className={clsx(
                      'relative flex flex-col xl:flex-row min-w-0 items-center justify-center gap-[6px] rounded-t-[8px] border px-[4px] py-[12px] text-[12px] xl:gap-[8px] xl:text-[14px] text-center leading-tight font-[500] transition-colors focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-btnPrimary',
                      activeSection === tab.id
                        ? 'z-10 -mb-px border-newTableBorder border-b-newBgColorInner bg-newBgColorInner text-btnPrimary'
                        : 'border-transparent text-newTextColor/70 hover:bg-boxHover'
                    )}
                  >
                    <img
                      src={tab.icon}
                      alt=""
                      aria-hidden="true"
                      className="h-[20px] w-[20px] shrink-0 object-contain"
                    />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            {isLoading ? (
              <div className="animate-pulse rounded-b-[8px] border border-newTableBorder bg-newBgColorInner p-[16px] text-newTextColor/70">
                {t('loading', 'Carregando...')}
              </div>
            ) : isInitialSetup ? (
              <>
                {/* SETUP INICIAL — todas seções como inputs, um Save global */}
                <ProductSection
                  sectionId="facebook"
                  feedback={feedback.facebook}
                  removing={removingSection === 'facebook'}
                  help={helpButton('facebook')}
                  activeSection={activeSection}
                  heading={
                    <div className="flex items-center gap-1">
                      <h3 className="text-sm font-semibold">
                        {t('fb_credentials_heading', 'Aplicativo Meta')}
                      </h3>
                      <FacebookHelp
                        label={t(
                          'fb_credentials_help_label',
                          'Sobre o aplicativo Meta'
                        )}
                        text={t(
                          'fb_credentials_help',
                          'O App ID e o App Secret identificam o aplicativo usado para conectar Páginas do Facebook e contas Instagram via Facebook Login. O mesmo aplicativo pode atender várias Páginas.'
                        )}
                      />
                    </div>
                  }
                >
                  <div className="grid grid-cols-2 gap-[12px]">
                    <LabeledInput
                      label={t('meta_facebook_app_id', 'Facebook App ID')}
                      placeholder={t(
                        'meta_facebook_app_id_placeholder',
                        'Cole o App ID do Facebook'
                      )}
                      value={formValues.clientId || ''}
                      onChange={(v) => handleField('clientId', v)}
                    />
                    <LabeledInput
                      label={t(
                        'meta_facebook_app_secret',
                        'Facebook App Secret'
                      )}
                      placeholder={t(
                        'meta_facebook_app_secret_placeholder',
                        'Cole o App Secret do Facebook'
                      )}
                      value={formValues.clientSecret || ''}
                      onChange={(v) => handleField('clientSecret', v)}
                    />
                  </div>
                  {facebookOauthUrl && (
                    <div className="border-t border-fifth pt-[12px]">
                      <CopyRow
                        label={t('fb_return_url', 'URL de retorno')}
                        help={
                          <FacebookHelp
                            label={t(
                              'fb_return_url_help_label',
                              'Sobre a URL de retorno'
                            )}
                            text={t(
                              'fb_return_url_help',
                              'Cadastre esta URL nos URIs de redirecionamento OAuth válidos do login do aplicativo Meta. Ela é diferente da URL do webhook.'
                            )}
                          />
                        }
                        value={facebookOauthUrl}
                        onCopy={() => copyToClipboard(facebookOauthUrl)}
                      />
                    </div>
                  )}
                  {!saving && editingSection !== 'facebook' && (
                    <FacebookAutomationSetup
                      onOpenMessenger={() => openTab('messenger')}
                      onOpenSystemUser={() => openTab('system-user')}
                      helpOpen={helpOpen && activeSection === 'facebook'}
                      onHelpChange={setHelpOpen}
                      helpId={helpId}
                      credentialVersion={data?.updatedAt || String(configured)}
                    />
                  )}
                </ProductSection>

                <ProductSection
                  sectionId="instagram"
                  feedback={feedback.instagram}
                  removing={removingSection === 'instagram'}
                  help={helpButton('instagram')}
                  activeSection={activeSection}
                  description={t(
                    'meta_product_instagram_desc',
                    'Utilizando para monitorar comentários e resposta de story em Automações'
                  )}
                >
                  <div className="grid grid-cols-2 gap-[12px]">
                    <LabeledInput
                      label={t('meta_instagram_app_id', 'Instagram App ID')}
                      placeholder={t(
                        'meta_instagram_app_id_placeholder',
                        'Produto Instagram API with Instagram Login → aba Setup'
                      )}
                      value={formValues.instagramAppId || ''}
                      onChange={(v) => handleField('instagramAppId', v)}
                    />
                    <LabeledInput
                      label={t(
                        'meta_instagram_app_secret',
                        'Instagram App Secret'
                      )}
                      placeholder={t(
                        'meta_instagram_app_secret_placeholder',
                        'Produto Instagram API with Instagram Login → aba Setup'
                      )}
                      value={formValues.instagramAppSecret || ''}
                      onChange={(v) => handleField('instagramAppSecret', v)}
                    />
                  </div>
                  <LabeledInput
                    label={t('verify_token', 'Verify Token')}
                    value={initialVerifyTokenValue}
                    onChange={(v) => handleField('webhookVerifyToken', v)}
                    onCopy={() => copyToClipboard(initialVerifyTokenValue)}
                  />
                  {(instagramOauthUrl || instagramStandaloneOauthUrl) && (
                    <div className="border-t border-fifth pt-[12px] flex flex-col gap-[8px]">
                      <div className="text-[12px] font-[600] text-textColor">
                        {t('oauth_redirect_uris', 'OAuth Redirect URIs')}
                      </div>
                      {instagramOauthUrl && (
                        <CopyRow
                          label={t(
                            'meta_instagram_redirect_via_facebook',
                            'Instagram (via Facebook Login)'
                          )}
                          value={instagramOauthUrl}
                          onCopy={() => copyToClipboard(instagramOauthUrl)}
                        />
                      )}
                      {instagramStandaloneOauthUrl && (
                        <CopyRow
                          label={t(
                            'meta_instagram_redirect_standalone',
                            'Instagram (Login direto)'
                          )}
                          value={instagramStandaloneOauthUrl}
                          onCopy={() =>
                            copyToClipboard(instagramStandaloneOauthUrl)
                          }
                        />
                      )}
                    </div>
                  )}
                  <div className="border-t border-fifth pt-[12px] flex flex-col gap-[8px]">
                    <div className="text-[12px] font-[600] text-textColor">
                      {t('meta_instagram_webhook', 'Webhook do Instagram')}
                    </div>
                    {callbackUrl && (
                      <CopyRow
                        label={t('callback_url', 'Callback URL')}
                        value={callbackUrl}
                        onCopy={() => copyToClipboard(callbackUrl)}
                      />
                    )}
                  </div>
                </ProductSection>

                <ProductSection
                  sectionId="threads"
                  feedback={feedback.threads}
                  removing={removingSection === 'threads'}
                  help={helpButton('threads')}
                  activeSection={activeSection}
                >
                  <div className="grid grid-cols-2 gap-[12px]">
                    <LabeledInput
                      label={t('meta_threads_app_id', 'Threads App ID')}
                      placeholder={t(
                        'meta_threads_app_id_placeholder',
                        'Threads App ID do Meta Developer Portal'
                      )}
                      value={formValues.threadsAppId || ''}
                      onChange={(v) => handleField('threadsAppId', v)}
                    />
                    <LabeledInput
                      label={t('meta_threads_app_secret', 'Threads App Secret')}
                      placeholder={t(
                        'meta_threads_app_secret_placeholder',
                        'Threads App Secret do Meta Developer Portal'
                      )}
                      value={formValues.threadsAppSecret || ''}
                      onChange={(v) => handleField('threadsAppSecret', v)}
                    />
                  </div>
                  {threadsOauthUrl && (
                    <div className="border-t border-fifth pt-[12px]">
                      <CopyRow
                        label={t('oauth_redirect_uri', 'OAuth Redirect URI')}
                        value={threadsOauthUrl}
                        onCopy={() => copyToClipboard(threadsOauthUrl)}
                      />
                    </div>
                  )}
                </ProductSection>

                {['facebook', 'instagram', 'threads'].includes(
                  activeSection
                ) && (
                  <div className="mt-[16px] space-y-3">
                    {initialFeedback && (
                      <MetaActionFeedback error={initialFeedback.error}>
                        {t(initialFeedback.key)}
                      </MetaActionFeedback>
                    )}
                    <Button
                      onClick={handleInitialSetup}
                      loading={saving}
                      loadingLabel={t('meta_action_saving')}
                    >
                      {t('save_credentials', 'Salvar credenciais')}
                    </Button>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* CONFIGURADO — edição por seção com ações per-section */}
                <ProductSection
                  sectionId="facebook"
                  feedback={feedback.facebook}
                  removing={removingSection === 'facebook'}
                  help={helpButton('facebook')}
                  activeSection={activeSection}
                  heading={
                    <div className="flex items-center gap-1">
                      <h3 className="text-sm font-semibold">
                        {t('fb_credentials_heading', 'Aplicativo Meta')}
                      </h3>
                      <FacebookHelp
                        label={t(
                          'fb_credentials_help_label',
                          'Sobre o aplicativo Meta'
                        )}
                        text={t(
                          'fb_credentials_help',
                          'O App ID e o App Secret identificam o aplicativo usado para conectar Páginas do Facebook e contas Instagram via Facebook Login. O mesmo aplicativo pode atender várias Páginas.'
                        )}
                      />
                    </div>
                  }
                  sectionConfigured={sectionConfigured.facebook}
                  showActionButtons
                  canEdit={
                    editingSection === null &&
                    testingSection === null &&
                    removingSection === null &&
                    !saving
                  }
                  isEditing={editingSection === 'facebook'}
                  onEdit={() => startEdit('facebook')}
                  onSave={() => handleSaveSection('facebook')}
                  onCancel={cancelEdit}
                  onTest={() => handleTestSection('facebook')}
                  onRemove={() => handleRemoveSection('facebook')}
                  saving={saving}
                  testing={testingSection === 'facebook'}
                  testResult={testResults.facebook}
                  editLabel={t('edit', 'Editar')}
                  saveLabel={t('save', 'Salvar')}
                  cancelLabel={t('cancel', 'Cancelar')}
                  testLabel={t('fb_test_credentials', 'Testar credenciais')}
                  removeLabel={t('remove', 'Remover')}
                  testOkLabel={t('meta_credentials_test_ok')}
                  testFailLabel={t('connection_failed', 'Falha na conexão')}
                >
                  {editingSection === 'facebook' ? (
                    <div className="grid grid-cols-2 gap-[12px]">
                      <LabeledInput
                        label={t('meta_facebook_app_id', 'Facebook App ID')}
                        placeholder={t(
                          'meta_facebook_app_id_placeholder',
                          'Cole o App ID do Facebook'
                        )}
                        value={formValues.clientId || ''}
                        onChange={(v) => handleField('clientId', v)}
                      />
                      <LabeledInput
                        label={t(
                          'meta_facebook_app_secret',
                          'Facebook App Secret'
                        )}
                        placeholder={t(
                          'meta_facebook_app_secret_placeholder',
                          'Cole o App Secret do Facebook'
                        )}
                        value={formValues.clientSecret || ''}
                        onChange={(v) => handleField('clientSecret', v)}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-[12px]">
                      <ReadOnlyRow
                        label={t('meta_facebook_app_id', 'Facebook App ID')}
                      />
                      <ReadOnlyRow
                        label={t(
                          'meta_facebook_app_secret',
                          'Facebook App Secret'
                        )}
                      />
                    </div>
                  )}
                  {facebookOauthUrl && (
                    <div className="border-t border-fifth pt-[12px]">
                      <CopyRow
                        label={t('fb_return_url', 'URL de retorno')}
                        help={
                          <FacebookHelp
                            label={t(
                              'fb_return_url_help_label',
                              'Sobre a URL de retorno'
                            )}
                            text={t(
                              'fb_return_url_help',
                              'Cadastre esta URL nos URIs de redirecionamento OAuth válidos do login do aplicativo Meta. Ela é diferente da URL do webhook.'
                            )}
                          />
                        }
                        value={facebookOauthUrl}
                        onCopy={() => copyToClipboard(facebookOauthUrl)}
                      />
                    </div>
                  )}
                  {!saving && editingSection !== 'facebook' && (
                    <FacebookAutomationSetup
                      onOpenMessenger={() => openTab('messenger')}
                      onOpenSystemUser={() => openTab('system-user')}
                      helpOpen={helpOpen && activeSection === 'facebook'}
                      onHelpChange={setHelpOpen}
                      helpId={helpId}
                      credentialVersion={data?.updatedAt || String(configured)}
                    />
                  )}
                </ProductSection>

                <ProductSection
                  sectionId="instagram"
                  feedback={feedback.instagram}
                  removing={removingSection === 'instagram'}
                  help={helpButton('instagram')}
                  activeSection={activeSection}
                  description={t(
                    'meta_product_instagram_desc',
                    'Utilizando para monitorar comentários e resposta de story em Automações'
                  )}
                  sectionConfigured={sectionConfigured.instagram}
                  showActionButtons
                  canEdit={
                    editingSection === null &&
                    testingSection === null &&
                    removingSection === null &&
                    !saving
                  }
                  isEditing={editingSection === 'instagram'}
                  onEdit={() => startEdit('instagram')}
                  onSave={() => handleSaveSection('instagram')}
                  onCancel={cancelEdit}
                  onRemove={() => handleRemoveSection('instagram')}
                  saving={saving}
                  editLabel={t('edit', 'Editar')}
                  saveLabel={t('save', 'Salvar')}
                  cancelLabel={t('cancel', 'Cancelar')}
                  removeLabel={t('remove', 'Remover')}
                >
                  {editingSection === 'instagram' ? (
                    <>
                      <div className="grid grid-cols-2 gap-[12px]">
                        <LabeledInput
                          label={t('meta_instagram_app_id', 'Instagram App ID')}
                          placeholder={t(
                            'meta_instagram_app_id_placeholder',
                            'Produto Instagram API with Instagram Login → aba Setup'
                          )}
                          value={formValues.instagramAppId || ''}
                          onChange={(v) => handleField('instagramAppId', v)}
                        />
                        <LabeledInput
                          label={t(
                            'meta_instagram_app_secret',
                            'Instagram App Secret'
                          )}
                          placeholder={t(
                            'meta_instagram_app_secret_placeholder',
                            'Produto Instagram API with Instagram Login → aba Setup'
                          )}
                          value={formValues.instagramAppSecret || ''}
                          onChange={(v) => handleField('instagramAppSecret', v)}
                        />
                      </div>
                      <div className="border-t border-fifth pt-[12px] flex flex-col gap-[8px]">
                        <div className="text-[12px] font-[600] text-textColor">
                          {t('meta_instagram_webhook', 'Webhook do Instagram')}
                        </div>
                        <div className="grid grid-cols-2 gap-[12px]">
                          {callbackUrl ? (
                            <CopyRow
                              label={t('callback_url', 'Callback URL')}
                              value={callbackUrl}
                              onCopy={() => copyToClipboard(callbackUrl)}
                            />
                          ) : (
                            <div />
                          )}
                          <LabeledInput
                            label={t('verify_token', 'Verify Token')}
                            value={
                              formValues.webhookVerifyToken ||
                              DEFAULT_VERIFY_TOKEN
                            }
                            onChange={(v) =>
                              handleField('webhookVerifyToken', v)
                            }
                            onCopy={() =>
                              copyToClipboard(
                                formValues.webhookVerifyToken ||
                                  DEFAULT_VERIFY_TOKEN
                              )
                            }
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-[12px]">
                        <ReadOnlyRow
                          label={t('meta_instagram_app_id', 'Instagram App ID')}
                        />
                        <ReadOnlyRow
                          label={t(
                            'meta_instagram_app_secret',
                            'Instagram App Secret'
                          )}
                        />
                      </div>
                      <div className="border-t border-fifth pt-[12px] flex flex-col gap-[8px]">
                        <div className="text-[12px] font-[600] text-textColor">
                          {t('meta_instagram_webhook', 'Webhook do Instagram')}
                        </div>
                        <div className="grid grid-cols-2 gap-[12px]">
                          {callbackUrl ? (
                            <CopyRow
                              label={t('callback_url', 'Callback URL')}
                              value={callbackUrl}
                              onCopy={() => copyToClipboard(callbackUrl)}
                            />
                          ) : (
                            <div />
                          )}
                          <ReadOnlyRow
                            label={t('verify_token', 'Verify Token')}
                            value={remoteVerifyToken}
                          />
                        </div>
                      </div>
                    </>
                  )}
                  {(instagramOauthUrl || instagramStandaloneOauthUrl) && (
                    <div className="border-t border-fifth pt-[12px] flex flex-col gap-[8px]">
                      <div className="text-[12px] font-[600] text-textColor">
                        {t('oauth_redirect_uris', 'OAuth Redirect URIs')}
                      </div>
                      {instagramOauthUrl && (
                        <CopyRow
                          label={t(
                            'meta_instagram_redirect_via_facebook',
                            'Instagram (via Facebook Login)'
                          )}
                          value={instagramOauthUrl}
                          onCopy={() => copyToClipboard(instagramOauthUrl)}
                        />
                      )}
                      {instagramStandaloneOauthUrl && (
                        <CopyRow
                          label={t(
                            'meta_instagram_redirect_standalone',
                            'Instagram (Login direto)'
                          )}
                          value={instagramStandaloneOauthUrl}
                          onCopy={() =>
                            copyToClipboard(instagramStandaloneOauthUrl)
                          }
                        />
                      )}
                    </div>
                  )}
                  <div className="border-t border-fifth pt-[12px]">
                    <MessagingTokensSection />
                  </div>
                </ProductSection>

                <ProductSection
                  sectionId="threads"
                  feedback={feedback.threads}
                  removing={removingSection === 'threads'}
                  help={helpButton('threads')}
                  activeSection={activeSection}
                  sectionConfigured={sectionConfigured.threads}
                  showActionButtons
                  canEdit={
                    editingSection === null &&
                    testingSection === null &&
                    removingSection === null &&
                    !saving
                  }
                  isEditing={editingSection === 'threads'}
                  onEdit={() => startEdit('threads')}
                  onSave={() => handleSaveSection('threads')}
                  onCancel={cancelEdit}
                  onRemove={() => handleRemoveSection('threads')}
                  saving={saving}
                  editLabel={t('edit', 'Editar')}
                  saveLabel={t('save', 'Salvar')}
                  cancelLabel={t('cancel', 'Cancelar')}
                  removeLabel={t('remove', 'Remover')}
                >
                  {editingSection === 'threads' ? (
                    <div className="grid grid-cols-2 gap-[12px]">
                      <LabeledInput
                        label={t('meta_threads_app_id', 'Threads App ID')}
                        placeholder={t(
                          'meta_threads_app_id_placeholder',
                          'Threads App ID do Meta Developer Portal'
                        )}
                        value={formValues.threadsAppId || ''}
                        onChange={(v) => handleField('threadsAppId', v)}
                      />
                      <LabeledInput
                        label={t(
                          'meta_threads_app_secret',
                          'Threads App Secret'
                        )}
                        placeholder={t(
                          'meta_threads_app_secret_placeholder',
                          'Threads App Secret do Meta Developer Portal'
                        )}
                        value={formValues.threadsAppSecret || ''}
                        onChange={(v) => handleField('threadsAppSecret', v)}
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-[12px]">
                      <ReadOnlyRow
                        label={t('meta_threads_app_id', 'Threads App ID')}
                      />
                      <ReadOnlyRow
                        label={t(
                          'meta_threads_app_secret',
                          'Threads App Secret'
                        )}
                      />
                    </div>
                  )}
                  {threadsOauthUrl && (
                    <div className="border-t border-fifth pt-[12px]">
                      <CopyRow
                        label={t('oauth_redirect_uri', 'OAuth Redirect URI')}
                        value={threadsOauthUrl}
                        onCopy={() => copyToClipboard(threadsOauthUrl)}
                      />
                    </div>
                  )}
                </ProductSection>
              </>
            )}

            {!isLoading && (
              <ProductSection
                sectionId="messenger"
                help={helpButton('messenger')}
                activeSection={activeSection}
              >
                {activeSection === 'messenger' &&
                  (saving || editingSection === 'facebook' ? (
                    <div className="space-y-3 text-sm">
                      <p>
                        {t(
                          'messenger_save_first',
                          'Conclua a edição das credenciais no Facebook antes de configurar o webhook.'
                        )}
                      </p>
                      <Button secondary onClick={() => openTab('facebook')}>
                        {t('messenger_back_facebook', 'Ir para Facebook')}
                      </Button>
                    </div>
                  ) : (
                    <MessengerWebhookSetup
                      credentialVersion={data?.updatedAt || String(configured)}
                      onOpenFacebook={() => openTab('facebook')}
                      helpOpen={helpOpen && activeSection === 'messenger'}
                      onHelpChange={setHelpOpen}
                      helpId={helpId}
                    />
                  ))}
              </ProductSection>
            )}
            {!isLoading && (
              <ProductSection
                sectionId="system-user"
                activeSection={activeSection}
                help={helpButton('system-user')}
              >
                {configured ? (
                  <MessagingTokensSection section="system-user" />
                ) : (
                  <p className="text-sm text-newTextColor/70">
                    {t('meta_credentials_save_first')}
                  </p>
                )}
              </ProductSection>
            )}
            {helpOpen &&
              ((['facebook', 'messenger'].includes(activeSection) &&
                (saving || editingSection === 'facebook')) ||
                activeSection === 'instagram' ||
                activeSection === 'threads' ||
                activeSection === 'system-user') && (
                <MetaCredentialsHelp
                  id={helpId}
                  section={activeSection}
                  tokensEnabled={configured}
                  configured={
                    activeSection === 'system-user' ||
                    activeSection === 'messenger'
                      ? configured
                      : sectionConfigured[activeSection]
                  }
                  onClose={() => setHelpOpen(false)}
                  onOpenSystemUser={() => openTab('system-user')}
                  onOpenMessenger={() => openTab('messenger')}
                />
              )}
          </div>
        </MessagingTokensProvider>
      )}
    </div>
  );
};

export const MetaCredentialsCard: React.FC<Props> = (props) => {
  const user = useUser();
  return (
    <MetaCredentialsCardForProfile
      key={`${user?.orgId || ''}:${user?.profileId || ''}`}
      {...props}
    />
  );
};
export default MetaCredentialsCard;
