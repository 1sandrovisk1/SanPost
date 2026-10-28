'use client';
import { AutomationContextHelp } from './shared-context-help.component';
import { AutomationMessageVariables } from './shared-message-variables.component';
import { PublicationPreviewControls } from './shared-response-controls.component';
import type { PublicationPreview } from './shared-publication-selector.component';

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
import {
  AutomationFollowGateFields,
  JourneyPreviewControls,
  ReplyPreviewControls,
} from './shared-response-controls.component';
import type { PreviewJourneyStage } from './shared-preview-journey';
import { AutomationPublicReplyToggle } from './shared-public-reply-toggle.component';
import { SharedReplyVariations } from './shared-reply-variations.component';
import { AutomationKeywordConditions } from './shared-keyword-conditions.component';
import { AutomationPublicationSelector } from './shared-publication-selector.component';
import {
  AutomationPreviewPanel,
  AutomationEditorLayout,
  AutomationPhoneFrame,
} from './shared-editor-preview.component';
import { AutomationAccountSelect } from './shared-account-select.component';
import {
  InstagramEditorConnection,
  useInstagramEditorConnection,
} from './shared-instagram-connection.component';
import { useAliases } from './hooks/use-unmatched-comments';
import {
  FC,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useIntegrationPosts } from '@gitroom/frontend/components/automations/hooks/use-flows';
import { useRouter } from 'next/navigation';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { WizardPhonePreview } from '@gitroom/frontend/components/automations/wizard-phone-preview.component';
import { AddLinkModal } from '@gitroom/frontend/components/automations/add-link-modal.component';
import { AdAliasesField } from '@gitroom/frontend/components/automations/ad-aliases-field.component';

const OPENING_DM_DEFAULT_PT =
  'Obrigado pelo interesse! Clique no botão abaixo para receber o link.';
const OPENING_DM_BTN_DEFAULT_PT = 'Quero o link';
const ALREADY_FOLLOWED_BTN_DEFAULT_PT = 'Já segui! 💙';
const GATE_EXHAUSTED_DEFAULT_PT =
  'Não consegui confirmar que você está seguindo. Tente novamente mais tarde 😉';
const DEFAULT_MAX_GATE_ATTEMPTS = 3;

interface Props {
  flowId?: string;
  initialFlow?: any;
  workspace?: WorkspaceNavigation;
}

function safeJson(data?: string): Record<string, any> {
  if (!data) return {};
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export const AutomationWizardComponent: FC<Props> = ({
  flowId,
  initialFlow,
  workspace,
}) => {
  const t = useT();
  const privateMessageId = useId();
  const fetchApi = useFetch();
  const router = useRouter();
  const toaster = useToaster();
  const { data: integrations } = useIntegrationList();
  const isEditing = !!flowId;

  // Form state
  const [name, setName] = useState(() =>
    flowId ? '' : t('automation_name_instagram_comment')
  );
  const [integrationId, setIntegrationId] = useState('');
  const [draftId, setDraftId] = useState<string | undefined>();
  const draftLock = useRef(false);
  const [preparingDraft, setPreparingDraft] = useState(false);
  const effectiveFlowId = flowId || draftId;
  const connection = useInstagramEditorConnection(integrationId);
  const { data: aliases } = useAliases(effectiveFlowId || null);

  const [postMode, setPostMode] = useState<
    'all' | 'specific' | 'next_publication' | 'scheduled'
  >('specific');
  const [scheduledPostId, setScheduledPostId] = useState('');
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const hasSpecificSource =
    selectedPostIds.length > 0 ||
    (Array.isArray(aliases) && aliases.length > 0);
  const [keywordMode, setKeywordMode] = useState<'any_word' | 'specific'>(
    'any_word'
  );
  const [keywords, setKeywords] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState('any');
  const [enableReply, setEnableReply] = useState(false);
  const [replyMessages, setReplyMessages] = useState<string[]>(['']);
  const [dmMessage, setDmMessage] = useState('');
  const [dmButtonText, setDmButtonText] = useState('');
  const [dmButtonUrl, setDmButtonUrl] = useState('');
  const [showAddLink, setShowAddLink] = useState(false);
  const [requireFollow, setRequireFollow] = useState(false);
  const [followGateMessage, setFollowGateMessage] = useState(
    t('automation_follow_comment_default')
  );
  const [openingDmMessage, setOpeningDmMessage] = useState(
    OPENING_DM_DEFAULT_PT
  );
  const [openingDmButtonText, setOpeningDmButtonText] = useState(
    OPENING_DM_BTN_DEFAULT_PT
  );
  const [alreadyFollowedButtonText, setAlreadyFollowedButtonText] = useState(
    ALREADY_FOLLOWED_BTN_DEFAULT_PT
  );
  const [gateExhaustedMessage, setGateExhaustedMessage] = useState(
    GATE_EXHAUSTED_DEFAULT_PT
  );
  const [maxGateAttempts, setMaxGateAttempts] = useState(
    DEFAULT_MAX_GATE_ATTEMPTS
  );
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
  const [editorStatus, setEditorStatusValue] = useState<EditorStatus>(
    initialFlow?.status || 'DRAFT'
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [replyPreviewIndex, setReplyPreviewIndex] = useState(0);
  const [journeyStage, setJourneyStage] =
    useState<PreviewJourneyStage>('delivery');
  const [activePreviewTab, setActivePreviewTab] = useState<
    'post' | 'comments' | 'dm'
  >('post');
  const [modalPosts, setModalPosts] = useState<any[]>([]);
  const [modalNextCursor, setModalNextCursor] = useState<string | null>(null);
  const [modalLoadingMore, setModalLoadingMore] = useState(false);

  const signature = JSON.stringify({
    name,
    integrationId,
    postMode,
    scheduledPostId,
    selectedPostIds,
    keywordMode,
    keywords,
    matchMode,
    enableReply,
    replyMessages,
    dmMessage,
    dmButtonText,
    dmButtonUrl,
    requireFollow,
    followGateMessage,
    openingDmMessage,
    openingDmButtonText,
    alreadyFollowedButtonText,
    gateExhaustedMessage,
    maxGateAttempts,
  });
  const { dirty, markSaved, resetBaseline } = useEditorDirty(
    signature,
    hydrated
  );
  useEffect(() => setActionError(null), [signature]);

  // Pre-fill form when editing
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
    const replyNode = initialFlow.nodes?.find(
      (n: any) => n.type === 'REPLY_COMMENT'
    );
    const dmNode = initialFlow.nodes?.find((n: any) => n.type === 'SEND_DM');
    const triggerCfg = safeJson(triggerNode?.data);
    const replyCfg = safeJson(replyNode?.data);
    const dmCfg = safeJson(dmNode?.data);
    setScheduledPostId(triggerCfg.scheduledPostId || '');
    setSelectedPostIds(triggerCfg.postIds || []);
    setPostMode(
      triggerCfg.mode === 'scheduled'
        ? 'scheduled'
        : triggerCfg.mode === 'next_publication' && !triggerCfg.postIds?.length
        ? 'next_publication'
        : triggerCfg.postIds?.length
        ? 'specific'
        : triggerCfg.mode === 'all'
        ? 'all'
        : 'specific'
    );
    setKeywordMode(triggerCfg.keywords?.length ? 'specific' : 'any_word');
    setKeywords(triggerCfg.keywords || []);
    setMatchMode(triggerCfg.matchMode || 'any');
    const msgs = replyCfg.messages?.length
      ? replyCfg.messages
      : replyCfg.message
      ? [replyCfg.message]
      : [];
    setEnableReply(msgs.length > 0);
    setReplyMessages(msgs.length ? msgs : ['']);
    setDmMessage(dmCfg.message || '');
    setDmButtonText(dmCfg.buttonText || '');
    setDmButtonUrl(dmCfg.buttonUrl || '');
    setRequireFollow(!!triggerCfg.requireFollow);
    setFollowGateMessage(
      typeof triggerCfg.followGateMessage === 'string'
        ? triggerCfg.followGateMessage
        : t('automation_follow_comment_default')
    );
    setOpeningDmMessage(
      typeof triggerCfg.openingDmMessage === 'string'
        ? triggerCfg.openingDmMessage
        : OPENING_DM_DEFAULT_PT
    );
    setOpeningDmButtonText(
      typeof triggerCfg.openingDmButtonText === 'string'
        ? triggerCfg.openingDmButtonText
        : OPENING_DM_BTN_DEFAULT_PT
    );
    setAlreadyFollowedButtonText(
      typeof triggerCfg.alreadyFollowedButtonText === 'string'
        ? triggerCfg.alreadyFollowedButtonText
        : ALREADY_FOLLOWED_BTN_DEFAULT_PT
    );
    setGateExhaustedMessage(
      typeof triggerCfg.gateExhaustedMessage === 'string'
        ? triggerCfg.gateExhaustedMessage
        : GATE_EXHAUSTED_DEFAULT_PT
    );
    setMaxGateAttempts(
      typeof triggerCfg.maxGateAttempts === 'number'
        ? triggerCfg.maxGateAttempts
        : DEFAULT_MAX_GATE_ATTEMPTS
    );
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

  const { data: posts, isLoading: postsLoading } = useIntegrationPosts(
    integrationId || null
  );

  const postsAccount = useRef(integrationId);
  postsAccount.current = integrationId;
  useEffect(() => {
    let cancelled = false;
    setModalPosts([]);
    setModalNextCursor(null);
    setModalLoadingMore(false);
    if (integrationId)
      void fetchApi(`/flows/integrations/${integrationId}/posts?limit=25`)
        .then(async (response) => {
          if (!response.ok) return;
          const data = await response.json();
          if (!cancelled) {
            setModalPosts(Array.isArray(data) ? data : data.posts || []);
            setModalNextCursor(data.nextCursor || null);
          }
        })
        .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [integrationId, fetchApi]);

  const loadMoreModalPosts = useCallback(async () => {
    if (!modalNextCursor || modalLoadingMore) return;
    setModalLoadingMore(true);
    try {
      const data = await fetchApi(
        `/flows/integrations/${integrationId}/posts?limit=25&cursor=${modalNextCursor}`
      ).then((r) => r.json());
      if (postsAccount.current !== integrationId) return;
      setModalPosts((prev) => [...prev, ...(data.posts ?? [])]);
      setModalNextCursor(data.nextCursor ?? null);
    } catch {
      // ignore
    } finally {
      setModalLoadingMore(false);
    }
  }, [modalNextCursor, modalLoadingMore, integrationId, fetchApi]);

  const [publicationPreviews, setPublicationPreviews] = useState<
    PublicationPreview[]
  >([]);
  const [previewPublicationId, setPreviewPublicationId] = useState('');
  const selectedPost =
    publicationPreviews.find((p) => p.id === previewPublicationId) ||
    publicationPreviews[0];

  const formProblems = [
    ...(!name.trim() ? [t('automation_name_required')] : []),
    ...(!integrationId ? [t('automation_account_required')] : []),
    ...(!isEditing && integrationId && !connection.ready
      ? [t('automation_connection_required')]
      : []),
    ...(postMode === 'specific' && !hasSpecificSource
      ? [t('automation_choose_publication_required')]
      : []),
    ...(postMode === 'scheduled' && !scheduledPostId
      ? [t('automation_choose_publication_required')]
      : []),
    ...(keywordMode === 'specific' && !keywords.length
      ? [t('automation_keywords_required')]
      : []),
    ...(!(enableReply && replyMessages.some((m) => m.trim())) &&
    !dmMessage.trim()
      ? [t('automation_response_required')]
      : []),
    ...(requireFollow && !dmMessage.trim()
      ? [t('automation_final_message_required')]
      : []),
    ...(requireFollow &&
    (!openingDmMessage.trim() || !openingDmButtonText.trim())
      ? [t('automation_opening_required')]
      : []),
    ...(requireFollow &&
    (!Number.isInteger(maxGateAttempts) ||
      maxGateAttempts < 1 ||
      maxGateAttempts > 10)
      ? [t('automation_follow_attempts_required')]
      : []),
    ...(requireFollow &&
    (!followGateMessage.trim() ||
      !alreadyFollowedButtonText.trim() ||
      !gateExhaustedMessage.trim())
      ? [t('automation_follow_messages_required')]
      : []),
  ];
  const canSave =
    !workspace?.readOnly &&
    !workspace?.switching &&
    hydrated &&
    !formProblems.length &&
    !preparingDraft &&
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
          triggerType: 'comment_on_post',
          postMode,
        };
        if (postMode === 'scheduled') body.scheduledPostId = scheduledPostId;
        if (postMode === 'specific' && selectedPostIds.length > 0) {
          body.postIds = selectedPostIds;
        }
        if (keywordMode === 'specific' && keywords.length > 0) {
          body.keywords = keywords;
          body.matchMode = matchMode;
        }
        if (enableReply) {
          const msgs = replyMessages.filter((m) => m.trim());
          if (msgs.length) body.replyMessages = msgs;
        }
        if (dmMessage.trim()) {
          body.dmMessage = dmMessage.trim();
          if (dmButtonText.trim() && dmButtonUrl.trim()) {
            body.dmButtonText = dmButtonText.trim();
            body.dmButtonUrl = dmButtonUrl.trim();
          }
        }
        body.requireFollow = requireFollow;
        if (requireFollow && followGateMessage.trim()) {
          body.followGateMessage = followGateMessage.trim();
        }
        if (requireFollow) {
          if (openingDmMessage.trim()) {
            body.openingDmMessage = openingDmMessage.trim();
          }
          if (openingDmButtonText.trim()) {
            body.openingDmButtonText = openingDmButtonText.trim();
          }
          if (alreadyFollowedButtonText.trim()) {
            body.alreadyFollowedButtonText = alreadyFollowedButtonText.trim();
          }
          if (gateExhaustedMessage.trim()) {
            body.gateExhaustedMessage = gateExhaustedMessage.trim();
          }
          const clampedAttempts = Math.max(
            1,
            Math.min(
              10,
              Math.floor(maxGateAttempts) || DEFAULT_MAX_GATE_ATTEMPTS
            )
          );
          body.maxGateAttempts = clampedAttempts;
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
        if (!flowId) router.push(`/automacoes/${flow.id}/wizard`);
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
          router.push(`/automacoes/${latestFlow.current.id}/wizard`);
      } finally {
        setSaving(false);
      }
    },
    [
      canSave,
      saving,
      name,
      integrationId,
      postMode,
      scheduledPostId,
      selectedPostIds,
      keywordMode,
      keywords,
      matchMode,
      enableReply,
      replyMessages,
      dmMessage,
      dmButtonText,
      dmButtonUrl,
      requireFollow,
      followGateMessage,
      openingDmMessage,
      openingDmButtonText,
      alreadyFollowedButtonText,
      gateExhaustedMessage,
      maxGateAttempts,
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

  const prepareDraft = async () => {
    if (
      draftLock.current ||
      effectiveFlowId ||
      !name.trim() ||
      !integrationId ||
      !connection.ready
    )
      return;
    draftLock.current = true;
    setPreparingDraft(true);
    try {
      const response = await fetchApi('/flows', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), integrationId }),
      });
      if (!response.ok) throw new Error('draft_failed');
      const draft = await response.json();
      if (typeof draft.id !== 'string') throw new Error('draft_failed');
      latestFlow.current = draft;
      setEditorStatusValue(draft.status || 'DRAFT');
      setDraftId(draft.id);
    } catch {
      toaster.show(t('failed_to_create_flow'), 'warning');
    } finally {
      draftLock.current = false;
      setPreparingDraft(false);
    }
  };

  const inputClass =
    'w-full bg-transparent outline-none text-[14px] text-textColor px-[16px] py-[10px]';
  const inputWrapperClass =
    'bg-newBgColorInner border border-newTableBorder rounded-[8px]';

  return (
    <AutomationWorkspace
      name={name}
      nameLabel={t('wizard_name')}
      onNameChange={setName}
      subtitle={`${(selectedIntegration as any)?.name || ''} · ${t(
        'automation_instagram_comment_type'
      )}`}
      status={editorStatus}
      dirty={dirty}
      busy={saving || preparingDraft}
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
        {/* Left sidebar — form (internal scroll) */}
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
            className="min-w-0 border-0 p-6 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain"
          >
            <section className="mb-5 space-y-3">
              <h2 className="text-base font-semibold">
                {t('automation_section_account')}
              </h2>
              <AutomationAccountSelect
                label={t('wizard_account')}
                value={integrationId}
                accounts={instagramIntegrations.map((ig: any) => ({
                  id: ig.id,
                  name: ig.name || ig.display || ig.id,
                }))}
                disabled={!!effectiveFlowId || preparingDraft || saving}
                onChange={(id) => {
                  setIntegrationId(id);
                  setPublicationPreviews([]);
                  setPreviewPublicationId('');
                  setSelectedPostIds([]);
                  setScheduledPostId('');
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
              {integrationId && (
                <InstagramEditorConnection connection={connection} />
              )}
            </section>

            {/* Step 1: When someone comments */}
            {integrationId && (
              <>
                <div className="border-t border-fifth pt-[20px] mb-[20px]">
                  <h2 className="text-[16px] font-semibold text-textColor mb-[12px]">
                    {t('automation_section_origin')}
                  </h2>

                  <AutomationPublicationSelector
                    onPreviewChange={setPublicationPreviews}
                    key={integrationId}
                    integrationId={integrationId}
                    mode={postMode}
                    postIds={selectedPostIds}
                    scheduledPostId={scheduledPostId}
                    posts={
                      modalPosts.length
                        ? modalPosts
                        : Array.isArray(posts)
                        ? posts
                        : []
                    }
                    loading={postsLoading}
                    onLoadMore={
                      modalNextCursor ? loadMoreModalPosts : undefined
                    }
                    loadingMore={modalLoadingMore}
                    onChange={(selection) => {
                      setPostMode(selection.mode);
                      setSelectedPostIds(selection.postIds);
                      setScheduledPostId(selection.scheduledPostId || '');
                      setActivePreviewTab('post');
                    }}
                  />

                  {/* Aliases de dark posts (anuncios) — aditivo a qualquer modo */}
                  <details className="mt-4 rounded-lg border border-newTableBorder p-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                      {t('trigger_ad_ids_label')}
                    </summary>
                    <div className="pt-3 space-y-3">
                      {!effectiveFlowId && (
                        <>
                          <p className="text-xs text-newTextColor/60">
                            {t('automation_prepare_draft_hint')}
                          </p>
                          <button
                            type="button"
                            disabled={
                              preparingDraft ||
                              saving ||
                              !name.trim() ||
                              !connection.ready
                            }
                            onClick={prepareDraft}
                            className="rounded-lg border border-newTableBorder px-3 py-2 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-btnPrimary"
                          >
                            {t(
                              preparingDraft
                                ? 'automation_preparing_draft'
                                : 'automation_prepare_draft'
                            )}
                          </button>
                        </>
                      )}
                      {effectiveFlowId && (
                        <AdAliasesField
                          flowId={effectiveFlowId}
                          integrationId={integrationId || null}
                        />
                      )}
                    </div>
                  </details>
                </div>

                {/* Section: E esse comentário possui (ManyChat style) */}
                <div className="border-t border-fifth pt-[20px] mb-[20px]">
                  <h2 className="text-[16px] font-semibold text-textColor mb-[12px]">
                    {t(
                      'automation_section_conditions',
                      'E esse comentário possui'
                    )}
                  </h2>

                  <AutomationKeywordConditions
                    specific={keywordMode === 'specific'}
                    keywords={keywords}
                    onSpecificChange={(value) =>
                      setKeywordMode(value ? 'specific' : 'any_word')
                    }
                    onKeywordsChange={setKeywords}
                    matchMode={matchMode}
                    onMatchModeChange={setMatchMode}
                    onFocus={() => setActivePreviewTab('comments')}
                  />
                </div>

                {/* DM section */}
                <section className="border-t border-fifth pt-[20px] mb-[20px]">
                  <h2 className="text-[16px] font-semibold text-textColor mb-[12px]">
                    {t('automation_section_response')}
                  </h2>
                  <div className="mt-3">
                    <AutomationPublicReplyToggle
                      enabled={enableReply}
                      onChange={(enabled) => {
                        setEnableReply(enabled);
                        setActivePreviewTab('comments');
                      }}
                      label={t('shared_add_public_reply')}
                    />
                  </div>
                  {enableReply && (
                    <div className="mt-3">
                      <SharedReplyVariations
                        messages={replyMessages}
                        onChange={setReplyMessages}
                        maxVariants={null}
                        onFocus={(index) => {
                          setReplyPreviewIndex(index);
                          setActivePreviewTab('comments');
                        }}
                      />
                    </div>
                  )}

                  <div className="mt-5 mb-3 flex items-center justify-between text-xs text-newTextColor/70">
                    <span>
                      {t(
                        requireFollow
                          ? 'automation_preview_delivery'
                          : 'automation_direct_delivery'
                      )}
                    </span>
                    <AutomationContextHelp
                      label={t('automation_delivery_help')}
                    >
                      {t(
                        requireFollow
                          ? 'automation_gate_delivery_hint'
                          : 'automation_direct_delivery_hint'
                      )}
                    </AutomationContextHelp>
                  </div>
                  <label
                    htmlFor={privateMessageId}
                    className="block text-sm mb-2"
                  >
                    {t('shared_message')}
                  </label>
                  <div className={inputWrapperClass}>
                    <textarea
                      id={privateMessageId}
                      className={`${inputClass} min-h-[100px] resize-y`}
                      rows={4}
                      placeholder={t('automation_private_message_placeholder')}
                      value={dmMessage}
                      onFocus={() => {
                        setActivePreviewTab('dm');
                        setJourneyStage('delivery');
                      }}
                      onChange={(e) => setDmMessage(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <AutomationMessageVariables
                      textareaId={privateMessageId}
                      onChange={setDmMessage}
                    />
                    <AutomationContextHelp label={t('automation_link_help')}>
                      {t('shared_link_hint')}
                    </AutomationContextHelp>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePreviewTab('dm');
                      setJourneyStage('delivery');
                      setShowAddLink(true);
                    }}
                    className="mt-[10px] rounded-[4px] border border-dashed border-fifth text-[12px] text-textColor px-[14px] py-[8px] hover:bg-boxHover"
                  >
                    {dmButtonText && dmButtonUrl
                      ? `${dmButtonText} · ${dmButtonUrl}`
                      : `+ ${t('story_add_link', 'Adicionar um link')}`}
                  </button>
                </section>

                {/* Extras — follow gate */}
                <div className="border-t border-fifth pt-[20px] mb-[20px]">
                  <h2 className="text-[16px] font-semibold text-textColor mb-[12px]">
                    {t(
                      'story_section_extras',
                      'Outros recursos para automatizar'
                    )}
                  </h2>
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
                            setJourneyStage(
                              e.target.checked ? 'opening' : 'delivery'
                            );
                            setActivePreviewTab('dm');
                          }}
                          className="h-[18px] w-[18px] accent-btnPrimary cursor-pointer"
                        />
                      </label>
                      <AutomationContextHelp
                        label={t('automation_follow_help')}
                      >
                        {t('story_require_follow_hint')}
                      </AutomationContextHelp>
                    </div>
                    {requireFollow && (
                      <div className="border-t border-newTableBorder p-3">
                        <AutomationFollowGateFields
                          values={{
                            openingDmMessage,
                            openingDmButtonText,
                            followGateMessage,
                            alreadyFollowedButtonText,
                            gateExhaustedMessage,
                            maxGateAttempts,
                          }}
                          onChange={(patch) => {
                            if (patch.openingDmMessage !== undefined)
                              setOpeningDmMessage(patch.openingDmMessage);
                            if (patch.openingDmButtonText !== undefined)
                              setOpeningDmButtonText(patch.openingDmButtonText);
                            if (patch.followGateMessage !== undefined)
                              setFollowGateMessage(patch.followGateMessage);
                            if (patch.alreadyFollowedButtonText !== undefined)
                              setAlreadyFollowedButtonText(
                                patch.alreadyFollowedButtonText
                              );
                            if (patch.gateExhaustedMessage !== undefined)
                              setGateExhaustedMessage(
                                patch.gateExhaustedMessage
                              );
                            if (patch.maxGateAttempts !== undefined)
                              setMaxGateAttempts(patch.maxGateAttempts);
                          }}
                          onFocusStage={(stage) => {
                            setJourneyStage(stage);
                            setActivePreviewTab('dm');
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}
          </fieldset>
        </section>

        {/* Right side — phone preview (fixed; the left column scrolls internally) */}
        <AutomationPreviewPanel>
          {(activePreviewTab === 'post' || activePreviewTab === 'comments') && (
            <PublicationPreviewControls
              posts={publicationPreviews}
              value={selectedPost?.id}
              onChange={setPreviewPublicationId}
            />
          )}
          {activePreviewTab === 'comments' && enableReply && (
            <ReplyPreviewControls
              messages={replyMessages}
              index={replyPreviewIndex}
              onChange={setReplyPreviewIndex}
            />
          )}
          {activePreviewTab === 'dm' && requireFollow && (
            <JourneyPreviewControls
              stage={journeyStage}
              onChange={setJourneyStage}
            />
          )}
          <AutomationPhoneFrame>
            <WizardPhonePreview
              postSelected={!!selectedPost}
              postMediaType={
                selectedPost?.thumbnailUrl ? undefined : selectedPost?.mediaType
              }
              postThumb={selectedPost?.thumbnailUrl || selectedPost?.mediaUrl}
              postCaption={selectedPost?.caption}
              replyMessage={
                enableReply
                  ? replyMessages[
                      Math.min(replyPreviewIndex, replyMessages.length - 1)
                    ]
                  : undefined
              }
              triggerType="comment_on_post"
              triggerText={keywords[0]}
              journey={{
                followGate: requireFollow,
                stage: journeyStage,
                openingMessage: openingDmMessage,
                openingButton: openingDmButtonText,
                gateMessage: followGateMessage,
                gateButton: alreadyFollowedButtonText,
                exhaustedMessage: gateExhaustedMessage,
              }}
              dmMessage={dmMessage || undefined}
              dmButtonText={dmButtonText || undefined}
              dmButtonUrl={dmButtonUrl || undefined}
              integrationPicture={(selectedIntegration as any)?.picture}
              integrationName={
                (selectedIntegration as any)?.name ||
                (selectedIntegration as any)?.display
              }
              activeTab={activePreviewTab}
              onTabChange={(next) => {
                if (next === 'post' || next === 'comments' || next === 'dm') {
                  setActivePreviewTab(next);
                }
              }}
            />
          </AutomationPhoneFrame>
        </AutomationPreviewPanel>

        <AddLinkModal
          open={showAddLink}
          initialText={dmButtonText}
          initialUrl={dmButtonUrl}
          onClose={() => setShowAddLink(false)}
          onSave={(text, url) => {
            setDmButtonText(text);
            setDmButtonUrl(url);
          }}
        />
      </AutomationEditorLayout>
    </AutomationWorkspace>
  );
};
