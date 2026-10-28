'use client';
import { AutomationEditorStage } from './shared-editor-stage.component';
import { PrivateMessageVariations } from './shared-private-variations.component';
import { AutomationConnectionIndicator } from './shared-connection-indicator.component';
import { AutomationContextHelp } from './shared-context-help.component';

import { EditorPendingAction } from './shared-editor-footer.component';
import { AutomationWorkspace } from './shared-workspace.component';
import type { WorkspaceNavigation } from './shared-workspace-navigation';
import { FlowExecutionsComponent } from './flow-executions.component';
import { useEditorDirty } from './shared-editor-dirty';
import {
  saveEditorChanges,
  setEditorStatus,
  EditorRecord,
  EditorStatus,
} from './shared-editor-actions';
import { JourneyPreviewControls } from './shared-response-controls.component';
import type { PreviewJourneyStage } from './shared-preview-journey';
import {
  AutomationPreviewPanel,
  AutomationEditorLayout,
  AutomationPhoneFrame,
} from './shared-editor-preview.component';
import { AutomationAccountSelect } from './shared-account-select.component';
import { useInstagramEditorConnection } from './shared-instagram-connection.component';
import {
  FC,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useRef,
} from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useIntegrationStories } from '@gitroom/frontend/components/automations/hooks/use-flows';
import { useRouter } from 'next/navigation';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { WizardPhonePreview } from '@gitroom/frontend/components/automations/wizard-phone-preview.component';
import {
  validatePrivateButtonVariants,
  type PrivateMessageVariant,
} from '@gitroom/nestjs-libraries/database/prisma/flows/private-message-variants';

interface Props {
  flowId?: string;
  initialFlow?: any;
  workspace?: WorkspaceNavigation;
}

const FOLLOW_GATE_DEFAULT_PT =
  'Olá! Esse conteúdo é exclusivo para seguidores. Me segue aqui e responde o story de novo para eu te enviar 💙';

function safeJson(data?: string): Record<string, any> {
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

const RadioDot: FC<{ active: boolean }> = ({ active }) => (
  <div
    className={`w-[16px] h-[16px] rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
      active ? 'border-btnPrimary' : 'border-customColor18'
    }`}
  >
    {active && <div className="w-[8px] h-[8px] rounded-full bg-btnPrimary" />}
  </div>
);

export const StoryWizardComponent: FC<Props> = ({
  flowId,
  initialFlow,
  workspace,
}) => {
  const t = useT();
  const messageId = useId();
  const fetchApi = useFetch();
  const router = useRouter();
  const toaster = useToaster();
  const { data: integrations } = useIntegrationList();
  const isEditing = !!flowId;

  const [name, setName] = useState(() =>
    flowId ? '' : t('automation_name_instagram_story')
  );
  const [integrationId, setIntegrationId] = useState('');
  const connection = useInstagramEditorConnection(integrationId);
  const [storyMode, setStoryMode] = useState<
    'all' | 'specific' | 'next_publication'
  >('all');
  const [selectedStoryIds, setSelectedStoryIds] = useState<string[]>([]);
  const [keywordMode, setKeywordMode] = useState<
    'any_word_or_reaction' | 'specific'
  >('any_word_or_reaction');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [requireFollow, setRequireFollow] = useState(false);
  const [followGateMessage, setFollowGateMessage] = useState(
    FOLLOW_GATE_DEFAULT_PT
  );
  const [dmMessage, setDmMessage] = useState('');
  const [dmMessages, setDmMessages] = useState<string[]>(['']);
  const [dmVariants, setDmVariants] = useState<
    PrivateMessageVariant[] | undefined
  >();
  const [dmPreviewIndex, setDmPreviewIndex] = useState(0);
  const [dmButtonText, setDmButtonText] = useState('');
  const [dmButtonUrl, setDmButtonUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingAction, setPendingAction] =
    useState<EditorPendingAction>('save');

  const [hydrated, setHydrated] = useState(!flowId);
  const hydratedId = useRef<string | undefined>(undefined);
  const latestFlow = useRef<EditorRecord | undefined>(
    initialFlow
      ? { ...initialFlow, id: initialFlow.id || flowId }
      : flowId
      ? { id: flowId }
      : undefined
  );
  const [draftId, setDraftId] = useState<string | undefined>();
  const [editorStatus, setEditorStatusValue] = useState<EditorStatus>(
    initialFlow?.status || 'DRAFT'
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [journeyStage, setJourneyStage] =
    useState<PreviewJourneyStage>('delivery');
  const signature = JSON.stringify({
    name,
    integrationId,
    storyMode,
    selectedStoryIds,
    keywordMode,
    keywords,
    requireFollow,
    followGateMessage,
    dmMessage,
    dmMessages,
    dmVariants,
    dmButtonText,
    dmButtonUrl,
  });
  const { dirty, markSaved, resetBaseline } = useEditorDirty(
    signature,
    hydrated
  );
  useEffect(() => setActionError(null), [signature]);
  const [activePreviewTab, setActivePreviewTab] = useState<
    'post' | 'comments' | 'dm' | 'story'
  >('story');
  const [messagingState, setMessagingState] = useState<{
    hasSystemToken: boolean;
    instagramTokens: Array<{ igUserId: string; username?: string }>;
  } | null>(null);

  // Fetch messaging tokens once to know if the selected integration can DM.
  useEffect(() => {
    let cancelled = false;
    fetchApi('/credentials/facebook/messaging-tokens')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setMessagingState({
            hasSystemToken: !!data.hasSystemToken,
            instagramTokens: Array.isArray(data.instagramTokens)
              ? data.instagramTokens
              : [],
          });
        }
      })
      .catch(() => {
        if (!cancelled) setMessagingState(null);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchApi]);

  useEffect(() => {
    const initialId = initialFlow?.id || flowId;
    if (!initialFlow) return;
    const sameRecord = hydratedId.current === initialId;
    if (
      sameRecord &&
      (dirty || initialFlow.updatedAt === latestFlow.current?.updatedAt)
    )
      return;
    if (
      sameRecord &&
      latestFlow.current?.updatedAt &&
      (!initialFlow.updatedAt ||
        new Date(initialFlow.updatedAt).getTime() <=
          new Date(latestFlow.current.updatedAt).getTime())
    )
      return;
    resetBaseline();
    hydratedId.current = initialId;
    latestFlow.current = { ...initialFlow, id: initialId };
    setEditorStatusValue(initialFlow.status || 'DRAFT');
    setHydrated(true);
    setName(initialFlow.name || '');
    setIntegrationId(
      initialFlow.integrationId || initialFlow.integration?.id || ''
    );
    const triggerNode = initialFlow.nodes?.find(
      (n: any) => n.type === 'TRIGGER'
    );
    const dmNode = initialFlow.nodes?.find((n: any) => n.type === 'SEND_DM');
    const triggerCfg = safeJson(triggerNode?.data);
    const dmCfg = safeJson(dmNode?.data);

    setStoryMode(
      triggerCfg.mode === 'next_publication' && !triggerCfg.storyIds?.length
        ? 'next_publication'
        : triggerCfg.storyIds?.length
        ? 'specific'
        : 'all'
    );
    setSelectedStoryIds(triggerCfg.storyIds || []);
    setKeywordMode(
      triggerCfg.keywords?.length ? 'specific' : 'any_word_or_reaction'
    );
    setKeywords(triggerCfg.keywords || []);
    setRequireFollow(!!triggerCfg.requireFollow);
    setFollowGateMessage(
      typeof triggerCfg.followGateMessage === 'string'
        ? triggerCfg.followGateMessage
        : FOLLOW_GATE_DEFAULT_PT
    );
    setDmVariants(dmCfg.variants);
    setDmMessage(
      dmCfg.variants?.[0]?.message || dmCfg.messages?.[0] || dmCfg.message || ''
    );
    setDmMessages(
      dmCfg.variants?.map((v: PrivateMessageVariant) => v.message) ||
        dmCfg.messages || [dmCfg.message || '']
    );
    setDmButtonText(dmCfg.buttonText || '');
    setDmButtonUrl(dmCfg.buttonUrl || '');
  }, [initialFlow, flowId, resetBaseline, dirty]);

  const instagramIntegrations = useMemo(() => {
    if (!Array.isArray(integrations)) return [];
    return integrations.filter((i: any) => i.identifier === 'instagram');
  }, [integrations]);

  const selectedIntegration = useMemo(
    () =>
      instagramIntegrations.find((ig: any) => ig.id === integrationId) || null,
    [instagramIntegrations, integrationId]
  );

  const { data: stories, isLoading: storiesLoading } = useIntegrationStories(
    storyMode === 'specific' ? integrationId || null : null
  );

  const selectedStory = useMemo(() => {
    if (!Array.isArray(stories) || selectedStoryIds.length === 0) return null;
    return stories.find((s: any) => s.id === selectedStoryIds[0]) || null;
  }, [stories, selectedStoryIds]);

  const toggleStory = (id: string) => {
    setSelectedStoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const addKeyword = () => {
    const v = keywordInput.trim();
    if (!v) return;
    if (!keywords.includes(v)) setKeywords([...keywords, v]);
    setKeywordInput('');
  };

  const removeKeyword = (k: string) =>
    setKeywords(keywords.filter((x) => x !== k));

  const invalidDmVariants = (() => {
    if (!dmVariants) return false;
    try {
      validatePrivateButtonVariants(dmVariants);
      return false;
    } catch {
      return true;
    }
  })();
  const formProblems = [
    ...(!name.trim() ? [t('automation_name_required')] : []),
    ...(!integrationId ? [t('automation_account_required')] : []),
    ...(!isEditing && integrationId && !connection.ready
      ? [t('automation_connection_required')]
      : []),
    ...(storyMode === 'specific' && !selectedStoryIds.length
      ? [t('automation_choose_story_required')]
      : []),
    ...(keywordMode === 'specific' && !keywords.length
      ? [t('automation_keywords_required')]
      : []),
    ...(invalidDmVariants ||
    !dmMessage.trim() ||
    dmMessages.some((m) => !m.trim() || m.length > (dmButtonText ? 640 : 2000))
      ? [t('automation_response_required')]
      : []),
    ...(requireFollow && !followGateMessage.trim()
      ? [t('automation_follow_messages_required')]
      : []),
  ];
  const canSave =
    !workspace?.readOnly &&
    !workspace?.switching &&
    hydrated &&
    !formProblems.length &&
    editorStatus !== 'ARCHIVED';

  const handleSave = useCallback(
    async (activate = false) => {
      if (!canSave || saving) return;
      setActionError(null);
      let configurationSaved = false;
      setPendingAction(activate ? 'activate' : 'save');
      setSaving(true);
      try {
        const body: Record<string, any> = {
          name: name.trim(),
          integrationId,
          triggerType: 'story_reply',
          postMode: storyMode,
          matchReactions: keywordMode === 'any_word_or_reaction',
          requireFollow,
        };
        if (requireFollow && followGateMessage.trim()) {
          body.followGateMessage = followGateMessage.trim();
        }
        if (storyMode === 'specific' && selectedStoryIds.length > 0) {
          body.storyIds = selectedStoryIds;
        }
        if (keywordMode === 'specific' && keywords.length > 0) {
          body.keywords = keywords;
        }
        if (dmMessage.trim()) {
          if (dmVariants) body.dmVariants = dmVariants;
          else if (dmMessages.length > 1) body.dmMessages = dmMessages;
          else body.dmMessage = dmMessage.trim();
          if (!dmVariants && dmButtonText.trim() && dmButtonUrl.trim()) {
            body.dmButtonText = dmButtonText.trim();
            body.dmButtonUrl = dmButtonUrl.trim();
          }
        }

        const flow = await saveEditorChanges(
          fetchApi,
          { engine: 'instagram', current: latestFlow.current, body, activate },
          (record, phase) => {
            latestFlow.current = record;
            setDraftId(record.id);
            setEditorStatusValue(record.status || 'DRAFT');
            if (phase === 'saved') {
              configurationSaved = true;
              markSaved(signature);
            }
          }
        );
        toaster.show(t(isEditing ? 'flow_updated' : 'flow_created'), 'success');
        if (!flowId) router.push(`/automations/instagram/${flow.id}`);
      } catch (error) {
        const reason = t(
          `shared_error_${
            error instanceof Error ? error.message.toLowerCase() : ''
          }`,
          t('shared_save_failed')
        );
        const message =
          configurationSaved && activate
            ? `${t('automation_activation_failed_saved')} ${reason}`
            : reason;
        setActionError(message);
        toaster.show(message, 'warning');
        if (configurationSaved && !flowId && latestFlow.current)
          router.push(`/automations/instagram/${latestFlow.current.id}`);
      } finally {
        setSaving(false);
      }
    },
    [
      canSave,
      saving,
      name,
      integrationId,
      storyMode,
      selectedStoryIds,
      keywordMode,
      keywords,
      requireFollow,
      followGateMessage,
      dmMessage,
      dmMessages,
      dmVariants,
      dmButtonText,
      dmButtonUrl,
      fetchApi,
      signature,
      markSaved,
      toaster,
      t,
      isEditing,
      flowId,
      router,
    ]
  );
  const changeStatus = async (status: EditorStatus) => {
    if (saving) return;
    if (status === 'ACTIVE' && (dirty || !latestFlow.current))
      return handleSave(true);
    if (!latestFlow.current) return;
    setPendingAction(status === 'ACTIVE' ? 'activate' : 'pause');
    setSaving(true);
    setActionError(null);
    try {
      await setEditorStatus(
        fetchApi,
        'instagram',
        latestFlow.current,
        status,
        (record) => {
          latestFlow.current = record;
          setEditorStatusValue(record.status || status);
        }
      );
    } catch (error) {
      setActionError(
        t(
          `shared_error_${
            error instanceof Error ? error.message.toLowerCase() : ''
          }`,
          t('shared_save_failed')
        )
      );
    } finally {
      setSaving(false);
    }
  };

  const sectionClass = 'flex flex-col gap-[12px]';
  const sectionTitleClass = 'text-[13px] font-semibold text-textColor';
  const radioRowClass =
    'flex items-start gap-[10px] p-[12px] rounded-[6px] border border-fifth cursor-pointer hover:bg-boxHover';

  // Check if the selected integration is covered by an available messaging
  // token (either System User Token OR a per-account entry). Shows a banner
  // when not configured. Only renders the banner after we've fetched state
  // and an integration is selected, to avoid flashing a false warning.
  const needsMessagingConfig = (() => {
    if (!messagingState || !selectedIntegration) return false;
    if (messagingState.hasSystemToken) return false;
    const internalId = (selectedIntegration as any)?.internalId;
    if (!internalId) return true;
    return !messagingState.instagramTokens.some(
      (t) => t.igUserId === internalId
    );
  })();

  return (
    <AutomationWorkspace
      name={name}
      nameLabel={t('flow_name')}
      onNameChange={setName}
      picture={(selectedIntegration as any)?.picture}
      subtitle={`${(selectedIntegration as any)?.name || ''} · ${t(
        'automation_name_instagram_story'
      )}`}
      status={editorStatus}
      dirty={dirty}
      busy={saving}
      pendingAction={pendingAction}
      valid={canSave}
      problems={formProblems}
      impact={t('automation_save_impact_instagram')}
      error={actionError}
      onSave={() => void handleSave(false)}
      onStatusChange={(next) => void changeStatus(next)}
      navigation={workspace}
      history={flowId ? <FlowExecutionsComponent flowId={flowId} /> : undefined}
    >
      <AutomationEditorLayout>
        {/* Left: form (internal scroll) */}
        <section
          aria-label={t('shared_configuration')}
          className="flex flex-col min-w-0 w-full lg:w-[600px] lg:max-w-[55%] lg:shrink-0 lg:min-h-0 bg-newBgColorInner"
        >
          <fieldset
            disabled={
              saving ||
              workspace?.switching ||
              workspace?.readOnly ||
              editorStatus === 'ARCHIVED'
            }
            className="min-w-0 border-0 p-4 space-y-3 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain"
          >
            {/* Messaging token banner */}
            {needsMessagingConfig && (
              <div className="flex items-start gap-[10px] rounded-[6px] border border-customColor13/40 bg-customColor13/10 px-[14px] py-[12px]">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-customColor13 flex-shrink-0 mt-[1px]"
                >
                  <path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                </svg>
                <div className="flex-1">
                  <div className="text-[12px] text-textColor font-[500]">
                    {t(
                      'story_wizard_messaging_banner',
                      'Para responder via DM a stories, configure um token de messaging em Settings > Credenciais.'
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => window.open('/settings', '_blank')}
                    className="mt-[6px] text-[11px] text-btnPrimary hover:opacity-80"
                  >
                    {t(
                      'story_wizard_messaging_configure',
                      'Configurar agora →'
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* Name + integration */}
            <AutomationEditorStage
              kind="account"
              step={1}
              title={t('automation_section_account')}
              summary={(selectedIntegration as any)?.name}
            >
              <AutomationAccountSelect
                connection={
                  integrationId && (
                    <AutomationConnectionIndicator
                      integrationId={integrationId}
                      provider="instagram"
                      ready={connection.ready}
                      loading={connection.loading}
                    />
                  )
                }
                label={t('wizard_account')}
                value={integrationId}
                accounts={instagramIntegrations.map((ig: any) => ({
                  id: ig.id,
                  picture: ig.picture,
                  name: ig.name || ig.display || ig.id,
                }))}
                disabled={isEditing || !!draftId || saving}
                onChange={(id) => {
                  setIntegrationId(id);
                  setSelectedStoryIds([]);
                }}
              />
              {instagramIntegrations.length === 0 && (
                <a
                  className="text-sm underline"
                  href="/launches"
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('shared_connect_channel')}
                </a>
              )}
            </AutomationEditorStage>

            {/* Story mode */}
            <AutomationEditorStage
              kind="origin"
              step={2}
              title={t('automation_section_origin')}
              summary={t(
                storyMode === 'all'
                  ? 'story_mode_all'
                  : storyMode === 'specific'
                  ? 'story_mode_specific'
                  : 'story_mode_next'
              )}
            >
              <label
                className={radioRowClass}
                onClick={() => setStoryMode('all')}
              >
                <RadioDot active={storyMode === 'all'} />
                <div>
                  <div className="text-[13px] text-textColor">
                    {t('story_mode_all', 'Qualquer story')}
                  </div>
                  <div className="text-[11px] text-customColor18 mt-[2px]">
                    {t(
                      'story_mode_all_hint',
                      'A automacao vai reagir a qualquer story publicado'
                    )}
                  </div>
                </div>
              </label>
              <label
                className={radioRowClass}
                onClick={() => setStoryMode('next_publication')}
              >
                <RadioDot active={storyMode === 'next_publication'} />
                <div>
                  <div className="text-[13px] text-textColor">
                    {t('story_mode_next', 'Proximo story')}
                  </div>
                  <div className="text-[11px] text-customColor18 mt-[2px]">
                    {t(
                      'story_mode_next_hint',
                      'Vincula ao proximo story publicado nesta conta'
                    )}
                  </div>
                </div>
              </label>
              <label
                className={radioRowClass}
                onClick={() => setStoryMode('specific')}
              >
                <RadioDot active={storyMode === 'specific'} />
                <div>
                  <div className="text-[13px] text-textColor">
                    {t('story_mode_specific', 'Story especifico')}
                  </div>
                  <div className="text-[11px] text-customColor18 mt-[2px]">
                    {t(
                      'story_mode_specific_hint',
                      'Informe o ID do story (visivel no Meta Business Suite)'
                    )}
                  </div>
                  {storyMode === 'specific' && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="mt-[10px]"
                    >
                      {!integrationId ? (
                        <p className="text-[11px] text-customColor18">
                          {t(
                            'story_select_account_first',
                            'Selecione uma conta do Instagram primeiro'
                          )}
                        </p>
                      ) : storiesLoading ? (
                        <p className="text-[11px] text-customColor18">
                          {t('loading_stories', 'Carregando stories...')}
                        </p>
                      ) : !stories?.length ? (
                        <p className="text-[11px] text-customColor18">
                          {t(
                            'no_active_stories',
                            'Nenhum story ativo nas ultimas 24h nesta conta.'
                          )}
                        </p>
                      ) : (
                        <div className="grid grid-cols-4 gap-[6px]">
                          {(stories as any[]).map((s: any) => {
                            const isSelected = selectedStoryIds.includes(s.id);
                            const thumb = s.thumbnailUrl || s.mediaUrl;
                            return (
                              <div
                                key={s.id}
                                onClick={() => toggleStory(s.id)}
                                className={`relative aspect-[9/16] rounded-[6px] overflow-hidden cursor-pointer border-2 ${
                                  isSelected
                                    ? 'border-btnPrimary'
                                    : 'border-transparent'
                                }`}
                              >
                                {thumb ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={thumb}
                                    alt=""
                                    className="w-full h-full object-cover"
                                  />
                                ) : (
                                  <div className="w-full h-full bg-sixth" />
                                )}
                                {s.mediaType === 'VIDEO' && (
                                  <div className="absolute top-[4px] right-[4px]">
                                    <svg
                                      width="12"
                                      height="12"
                                      viewBox="0 0 24 24"
                                      fill="white"
                                    >
                                      <rect
                                        x="2"
                                        y="2"
                                        width="20"
                                        height="20"
                                        rx="3"
                                      />
                                      <polygon
                                        points="10,8 16,12 10,16"
                                        fill="#000"
                                      />
                                    </svg>
                                  </div>
                                )}
                                {isSelected && (
                                  <div className="absolute inset-0 bg-btnPrimary/20 flex items-center justify-center">
                                    <svg
                                      width="16"
                                      height="16"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="white"
                                      strokeWidth="3"
                                    >
                                      <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </label>
            </AutomationEditorStage>

            {/* Keyword mode */}
            <AutomationEditorStage
              kind="conditions"
              step={3}
              title={t('automation_section_conditions')}
              summary={
                keywordMode === 'specific'
                  ? keywords.join(', ')
                  : t('story_keyword_mode_any')
              }
            >
              <label
                className={radioRowClass}
                onClick={() => setKeywordMode('any_word_or_reaction')}
              >
                <RadioDot active={keywordMode === 'any_word_or_reaction'} />
                <div className="text-[13px] text-textColor">
                  {t(
                    'story_keyword_mode_any',
                    'Qualquer palavra-chave ou reacao'
                  )}
                </div>
              </label>
              <label
                className={radioRowClass}
                onClick={() => setKeywordMode('specific')}
              >
                <RadioDot active={keywordMode === 'specific'} />
                <div className="w-full">
                  <div className="text-[13px] text-textColor">
                    {t(
                      'story_keyword_mode_specific',
                      'Palavras ou reacoes especificas'
                    )}
                  </div>
                  {keywordMode === 'specific' && (
                    <div onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-[6px] mt-[8px]">
                        <input
                          type="text"
                          value={keywordInput}
                          onChange={(e) => setKeywordInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addKeyword();
                            }
                          }}
                          className="flex-1 bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[12px] text-textColor px-[10px] py-[6px] outline-none"
                          placeholder={t(
                            'story_keywords_placeholder',
                            'Adicionar palavra-chave'
                          )}
                        />
                        <button
                          type="button"
                          onClick={addKeyword}
                          className="rounded-[4px] bg-btnPrimary text-white text-[11px] px-[10px] py-[6px]"
                        >
                          {t('add', 'Adicionar')}
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-[6px] mt-[8px]">
                        {keywords.map((k) => (
                          <span
                            key={k}
                            className="inline-flex items-center gap-[6px] rounded-[12px] bg-btnSimple border border-fifth px-[8px] py-[2px] text-[11px] text-textColor"
                          >
                            {k}
                            <button
                              type="button"
                              onClick={() => removeKeyword(k)}
                              className="text-customColor18 hover:text-textColor"
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </label>
            </AutomationEditorStage>

            {/* DM section */}
            <AutomationEditorStage
              kind="private"
              step={4}
              title={t('automation_stage_private_title')}
              summary={t(
                dmMessages.length === 1
                  ? 'automation_stage_variations_one'
                  : 'automation_stage_variations_count'
              ).replace('{count}', String(dmMessages.length))}
            >
              <PrivateMessageVariations
                maxLength={dmButtonText ? 640 : 2000}
                messages={dmMessages}
                variants={dmVariants}
                buttonText={dmButtonText}
                buttonUrl={dmButtonUrl}
                onVariantsChange={(variants) => {
                  setDmVariants(variants);
                  setDmMessages(variants.map((v) => v.message));
                  setDmMessage(variants[0]?.message || '');
                  setDmButtonText('');
                  setDmButtonUrl('');
                }}
                onChange={(messages) => {
                  setDmMessages(messages);
                  setDmMessage(messages[0]);
                }}
                onFocus={(index) => {
                  setDmPreviewIndex(index);
                  setActivePreviewTab('dm');
                  setJourneyStage('delivery');
                }}
              />
            </AutomationEditorStage>

            {/* Extras */}
            <AutomationEditorStage
              kind="followers"
              step={5}
              title={t('automation_stage_followers_title')}
              summary={t(
                requireFollow
                  ? 'automation_stage_enabled'
                  : 'automation_stage_disabled'
              )}
            >
              <div className="rounded-[6px] border border-fifth">
                <div className="flex items-center gap-1 pr-3">
                  <label className="flex flex-1 items-center justify-between gap-[12px] p-[10px] cursor-pointer">
                    <div>
                      <div className="text-[13px] text-textColor">
                        {t(
                          'story_require_follow',
                          'Pedir para seguir antes de enviar'
                        )}
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={requireFollow}
                      onChange={(e) => {
                        setRequireFollow(e.target.checked);
                        setJourneyStage(e.target.checked ? 'gate' : 'delivery');
                        setActivePreviewTab('dm');
                      }}
                      className="h-[18px] w-[18px] accent-btnPrimary cursor-pointer"
                    />
                  </label>
                  <AutomationContextHelp label={t('automation_follow_help')}>
                    {t('story_require_follow_hint')}
                  </AutomationContextHelp>
                </div>
                {requireFollow && (
                  <div className="border-t border-fifth p-[10px] flex flex-col gap-[6px]">
                    <label
                      htmlFor={`${messageId}-gate`}
                      className="text-[11px] text-customColor18"
                    >
                      {t(
                        'story_follow_gate_label',
                        'Mensagem enviada para quem ainda não segue'
                      )}
                    </label>
                    <textarea
                      id={`${messageId}-gate`}
                      value={followGateMessage}
                      onFocus={() => {
                        setActivePreviewTab('dm');
                        setJourneyStage('gate');
                      }}
                      onChange={(e) => setFollowGateMessage(e.target.value)}
                      rows={3}
                      placeholder={t(
                        'story_follow_gate_placeholder',
                        FOLLOW_GATE_DEFAULT_PT
                      )}
                      className="w-full bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[12px] text-textColor px-[10px] py-[8px] outline-none resize-none"
                    />
                  </div>
                )}
              </div>
            </AutomationEditorStage>
          </fieldset>
        </section>

        {/* Right: preview (fixed; the left column scrolls internally) */}
        <AutomationPreviewPanel>
          {activePreviewTab === 'dm' && requireFollow && (
            <JourneyPreviewControls
              story
              stage={journeyStage}
              onChange={setJourneyStage}
            />
          )}
          <AutomationPhoneFrame>
            <WizardPhonePreview
              variant="story"
              triggerText={keywords[0]}
              journey={{
                followGate: requireFollow,
                story: true,
                stage: journeyStage,
                gateMessage: followGateMessage,
              }}
              storyMode={storyMode}
              storyThumb={
                selectedStory?.thumbnailUrl || selectedStory?.mediaUrl
              }
              dmMessage={
                dmMessages[Math.min(dmPreviewIndex, dmMessages.length - 1)]
              }
              dmButtonText={
                dmVariants
                  ? dmVariants[Math.min(dmPreviewIndex, dmVariants.length - 1)]
                      ?.buttonText || ''
                  : dmButtonText
              }
              dmButtonUrl={
                dmVariants
                  ? dmVariants[Math.min(dmPreviewIndex, dmVariants.length - 1)]
                      ?.buttonUrl || ''
                  : dmButtonUrl
              }
              commenterName="usuario"
              integrationPicture={(selectedIntegration as any)?.picture}
              integrationName={(selectedIntegration as any)?.name}
              activeTab={activePreviewTab}
              onTabChange={(t) => setActivePreviewTab(t)}
            />
          </AutomationPhoneFrame>
        </AutomationPreviewPanel>
      </AutomationEditorLayout>
    </AutomationWorkspace>
  );
};
