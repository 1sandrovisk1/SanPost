'use client';
import { PrivateMessageVariations } from './shared-private-variations.component';
import { SharedConnectionIndicator } from './shared-connection-indicator.component';
import { AutomationContextHelp } from './shared-context-help.component';
import { PublicationPreviewControls } from './shared-response-controls.component';
import type { PublicationPreview } from './shared-publication-selector.component';
import { EditorPendingAction } from './shared-editor-footer.component';
import {
  saveEditorChanges,
  setEditorStatus,
  EditorRecord,
  EditorStatus,
} from './shared-editor-actions';
import { AutomationWorkspace } from './shared-workspace.component';
import { useWorkspaceMode } from './shared-workspace-navigation';
import {
  AutomationPreviewPanel,
  AutomationEditorLayout,
  AutomationPhoneFrame,
} from './shared-editor-preview.component';
import { AutomationAccountSelect } from './shared-account-select.component';
import { MessengerPriority } from './messenger-priority.component';
import { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { usePreventWindowUnload } from '@gitroom/react/helpers/use.prevent.window.unload';
import { Button } from '@gitroom/react/form/button';
import { useCurrentProfile } from '@gitroom/frontend/hooks/use-current-profile.hook';
import { useSharedFlowData } from './hooks/use-shared-flows';
import { SharedFlowCanvas } from './shared-flow-canvas.component';
import {
  SharedChannelPosts,
  sharedInputClass as inputClass,
} from './shared-channel-posts.component';
import { SharedFlowHistory } from './shared-flow-history.component';
import { SharedReplyVariations } from './shared-reply-variations.component';
import { WizardPhonePreview } from './wizard-phone-preview.component';
import { AutomationPublicReplyToggle } from './shared-public-reply-toggle.component';
import { AutomationKeywordConditions } from './shared-keyword-conditions.component';
import { AddLinkModal } from './add-link-modal.component';
import {
  sharedFailureCode,
  validateSharedDraft,
  type DraftProblem,
} from './shared-flow-ui';
import {
  simpleDefinition,
  getTriggerType,
  type AutomationTriggerType,
  normalizeDefinition,
  type CommentDefinition,
} from '@gitroom/nestjs-libraries/database/prisma/flows-v2/flow-definition';
import type {
  SharedFlowView,
  AutomationChannelView,
  FlowChannelDto,
} from '@gitroom/nestjs-libraries/dtos/flows/flow-v2.dto';
const comparableConfig = (data: string) =>
  JSON.stringify(
    Object.entries(JSON.parse(data)).sort(([a], [b]) => a.localeCompare(b))
  );
function simpleValues(definition: CommentDefinition) {
  const trigger = definition.nodes.find((n) => n.type === 'TRIGGER');
  const dm = definition.nodes.find((n) => n.type === 'SEND_DM');
  const reply = definition.nodes.find((n) => n.type === 'REPLY_COMMENT');
  const cfg = trigger ? JSON.parse(trigger.data) : {};
  const dmCfg = dm ? JSON.parse(dm.data) : {};
  const replyCfg = reply ? JSON.parse(reply.data) : {};
  const values = {
    triggerType: getTriggerType(definition),
    ...(cfg.triggerType === 'messenger_message'
      ? { priority: cfg.priority }
      : {}),
    keywords: cfg.keywords || [],
    matchMode: cfg.matchMode || 'any',
    message: dmCfg.message || '',
    dmMessages: dmCfg.messages as string[] | undefined,
    reply: replyCfg.message || '',
    replyMessages: replyCfg.messages as string[] | undefined,
    buttonText: dmCfg.buttonText || '',
    buttonUrl: dmCfg.buttonUrl || '',
  };
  const expected = simpleDefinition(values);
  const compatible =
    definition.nodes.length === expected.nodes.length &&
    definition.nodes.every(
      (n, i) =>
        n.type === expected.nodes[i].type &&
        comparableConfig(n.data) === comparableConfig(expected.nodes[i].data)
    ) &&
    definition.edges.length === definition.nodes.length - 1 &&
    definition.edges.every(
      (e, i) =>
        e.sourceNodeId === definition.nodes[i].id &&
        e.targetNodeId === definition.nodes[i + 1].id &&
        !e.sourceHandle
    );
  return { values, compatible };
}
export function SharedFlowCreator({ id }: { id?: string }) {
  const { profile } = useCurrentProfile();
  return (
    <SharedFlowCreatorForm key={`${profile?.id}:${id || 'new'}`} id={id} />
  );
}
function SharedFlowCreatorForm({ id }: { id?: string }) {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const fetchApi = useFetch();
  const toaster = useToaster();
  const availableResult =
    useSharedFlowData<AutomationChannelView[]>('/flows-v2/channels');
  const {
    data: remoteFlow,
    mutate,
    error,
    isLoading,
  } = useSharedFlowData<SharedFlowView>(id ? `/flows-v2/${id}` : null);
  const [savedRecord, setSavedRecord] = useState<EditorRecord | undefined>(
    undefined
  );
  const currentRecord = useRef<EditorRecord | undefined>(undefined);
  const flow = remoteFlow;
  const recordStatus = ((savedRecord &&
  (!flow || (savedRecord.revision ?? 0) >= flow.revision)
    ? savedRecord.status
    : flow?.status) || 'DRAFT') as EditorStatus;
  // New entries are Facebook-only; saved V2 flows retain their original networks.
  const platforms = useMemo(
    () => new Set(id ? flow?.channels.map((c) => c.platform) : ['facebook']),
    [id, flow]
  );
  const available = useMemo(
    () =>
      availableResult.data?.filter((c) =>
        platforms.has(
          c.providerIdentifier === 'facebook' ? 'facebook' : 'instagram'
        )
      ),
    [availableResult.data, platforms]
  );
  const facebookOnly = platforms.size === 1 && platforms.has('facebook');
  const initialChannel = params.get('channel');
  const initialTrigger =
    !id && params.get('trigger') === 'messenger_message'
      ? 'messenger_message'
      : 'comment_on_post';
  const [name, setName] = useState(() =>
    id
      ? ''
      : t(
          initialTrigger === 'messenger_message'
            ? 'automation_name_message'
            : 'automation_name_facebook_comment'
        )
  );
  const [channels, setChannels] = useState<FlowChannelDto[]>([]);
  const [definition, setDefinition] = useState<CommentDefinition>(() =>
    simpleDefinition({ message: '', triggerType: initialTrigger })
  );

  const [busy, setBusy] = useState(false);
  const [pendingAction, setPendingAction] =
    useState<EditorPendingAction>('save');

  const [dirty, setDirty] = useState(false);
  usePreventWindowUnload(dirty);

  const [problems, setProblems] = useState<DraftProblem[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [keywordSpecific, setKeywordSpecific] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [publicReply, setPublicReply] = useState(false);
  const [focusNode, setFocusNode] = useState<string | undefined>();
  const [previewChannel, setPreviewChannel] = useState('');
  const [replyPreviewIndex, setReplyPreviewIndex] = useState(0);
  const [previewTab, setPreviewTab] = useState<
    'post' | 'comments' | 'dm' | 'story'
  >('dm');
  useEffect(() => {
    if (
      flow &&
      !dirty &&
      (!currentRecord.current ||
        flow.revision > (currentRecord.current.revision ?? 0))
    ) {
      currentRecord.current = { ...flow, status: flow.status as EditorStatus };
      setName(flow.name);
      setChannels(flow.channels);
      setDefinition(flow.definition);
      setKeywordSpecific(
        simpleValues(flow.definition).values.keywords.length > 0
      );

      setPublicReply(
        flow.definition.nodes.some((n) => n.type === 'REPLY_COMMENT')
      );
    }
  }, [flow, dirty]);
  useEffect(() => {
    if (
      !id &&
      !currentRecord.current &&
      !dirty &&
      initialChannel &&
      available?.some((c) => c.id === initialChannel)
    )
      setChannels([
        {
          integrationId: initialChannel,
          postMode: initialTrigger === 'messenger_message' ? 'all' : 'specific',
          postIds: [],
        },
      ]);
  }, [available, initialChannel, initialTrigger, id, dirty]);
  const disabled = busy || recordStatus === 'ARCHIVED';
  const { values, compatible } = simpleValues(definition);
  const navigation = useWorkspaceMode(
    'quick',
    (next) =>
      !busy && (next !== 'quick' || compatible) && (next !== 'history' || !!id)
  );
  const workspaceMode =
    navigation.mode === 'quick' && !compatible ? 'flow' : navigation.mode;
  const editorOwner = useRef<'quick' | 'flow'>('quick');
  if (workspaceMode !== 'history') editorOwner.current = workspaceMode;
  const advanced = editorOwner.current === 'flow';
  const messenger = values.triggerType === 'messenger_message';
  const [dmPreviewIndex, setDmPreviewIndex] = useState(0);
  const privateMessages = values.dmMessages || [values.message];
  const replyMessages = values.replyMessages || [values.reply];
  const hasPublicReply =
    publicReply || definition.nodes.some((n) => n.type === 'REPLY_COMMENT');
  const currentReplyIndex = Math.min(
    replyPreviewIndex,
    replyMessages.length - 1
  );
  const channelViews = channels.map((c) => {
    const account = available?.find((a) => a.id === c.integrationId);
    const saved = flow?.channels.find(
      (a) => a.integrationId === c.integrationId
    );
    return {
      ...c,
      name: account?.name || saved?.name || t('flow_account_missing'),
      platform: account
        ? account.providerIdentifier === 'facebook'
          ? 'facebook'
          : 'instagram'
        : saved?.platform || '',
      picture: account?.picture,
    };
  });
  const [publicationPreviews, setPublicationPreviews] = useState<
    Record<string, PublicationPreview[]>
  >({});
  const [previewPublicationId, setPreviewPublicationId] = useState('');
  const preview =
    channelViews.find((c) => c.integrationId === previewChannel) ||
    channelViews[0];
  const setGraph = (graph: CommentDefinition) => {
    setDefinition(graph);
    setDirty(true);
    setProblems([]);
    setActionError(null);
  };
  const editSimple = (value: Partial<typeof values>) =>
    setGraph(simpleDefinition({ ...values, ...value }));
  const errorMessage = (code: string) =>
    t(`shared_error_${code.toLowerCase()}`, t('shared_save_failed'));
  const remember = (
    record: EditorRecord,
    phase: 'prepared' | 'saved' | 'status'
  ) => {
    currentRecord.current = record;
    setSavedRecord(record);
    if (phase === 'saved') setDirty(false);
    void mutate();
  };
  const showFailure = (err: unknown) =>
    setActionError(
      errorMessage(err instanceof Error ? err.message : '') +
        (err && typeof err === 'object' && 'conflictingFlowName' in err
          ? ` · ${String(err.conflictingFlowName)}`
          : '')
    );
  const save = async (activate = false) => {
    if (busy) return;
    const invalid = validateSharedDraft(name, channels, definition);
    setProblems(invalid);
    setActionError(null);
    if (invalid.length) return;
    setPendingAction(activate ? 'activate' : 'save');
    setBusy(true);
    let configurationSaved = false;
    try {
      const saved = await saveEditorChanges(
        fetchApi,
        {
          engine: 'facebook',
          current:
            currentRecord.current ||
            (flow
              ? { ...flow, status: flow.status as EditorStatus }
              : undefined),
          body: {
            name: name.trim(),
            channels: channels.map((c) => ({
              integrationId: c.integrationId,
              postMode: c.postMode,
              postIds: c.postIds,
              ...(c.postMode === 'scheduled'
                ? { scheduledPostId: c.scheduledPostId }
                : {}),
            })),
            definition: normalizeDefinition(definition),
          },
          activate,
        },
        (record, phase) => {
          remember(record, phase);
          if (phase === 'saved') configurationSaved = true;
        }
      );
      if (!id)
        router.replace(
          `/automations/${saved.id}${
            workspaceMode === 'flow' ? '?view=flow' : ''
          }`
        );
      toaster.show(t('flow_saved'), 'success');
    } catch (err) {
      if (configurationSaved && activate) {
        const message = `${t(
          'automation_activation_failed_saved'
        )} ${errorMessage(err instanceof Error ? err.message : '')}`;
        setActionError(message);
        if (!id && currentRecord.current) {
          toaster.show(message, 'warning');
          router.replace(
            `/automations/${currentRecord.current.id}${
              workspaceMode === 'flow' ? '?view=flow' : ''
            }`
          );
        }
      } else showFailure(err);
    } finally {
      setBusy(false);
    }
  };
  const status = async (target: EditorStatus) => {
    if (busy) return;
    const record =
      currentRecord.current ||
      (flow ? { ...flow, status: flow.status as EditorStatus } : undefined);
    if (target === 'ACTIVE' && (dirty || !record)) return save(true);
    if (!record) return;
    setPendingAction(target === 'ACTIVE' ? 'activate' : 'pause');
    setBusy(true);
    setActionError(null);
    try {
      const updated = await setEditorStatus(
        fetchApi,
        'facebook',
        record,
        target,
        remember
      );
      if (!id)
        router.replace(
          `/automations/${updated.id}${
            workspaceMode === 'flow' ? '?view=flow' : ''
          }`
        );
    } catch (err) {
      showFailure(err);
    } finally {
      setBusy(false);
    }
  };
  if (error)
    return (
      <p role="alert" className="p-6">
        {t('flow_not_found')}
      </p>
    );
  if (id && (isLoading || !flow))
    return (
      <p role="status" className="p-6">
        {t('loading')}
      </p>
    );
  const previewPosts = preview
    ? publicationPreviews[preview.integrationId] || []
    : [];
  const selectedPost =
    previewPosts.find((p) => p.id === previewPublicationId) || previewPosts[0];
  const channelEditor = (
    <section id="shared-channels" className="space-y-4">
      {availableResult.isLoading && <p>{t('loading')}</p>}
      {availableResult.error && (
        <div role="alert" className="text-sm">
          <p>{t('shared_channels_error')}</p>
          <button
            className="underline"
            onClick={() => void availableResult.mutate()}
          >
            {t('fb_auto_retry')}
          </button>
        </div>
      )}
      {available?.length === 0 && (
        <p className="text-sm">
          {t(
            facebookOnly
              ? 'facebook_automation_no_pages'
              : 'shared_channels_empty'
          )}{' '}
          <a
            href="/launches"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            {t('shared_connect_channel')}
          </a>
        </p>
      )}
      {Array.from(platforms).map((platform) => {
        const selected = channelViews.find((c) => c.platform === platform);
        const accounts = (available || [])
          .filter(
            (c) =>
              (c.providerIdentifier === 'facebook'
                ? 'facebook'
                : 'instagram') === platform
          )
          .map((c) => ({ id: c.id, name: c.name, picture: c.picture }));
        if (selected && !accounts.some((a) => a.id === selected.integrationId))
          accounts.push({
            id: selected.integrationId,
            name: selected.name || t('automation_account_unavailable'),
            picture: undefined,
          });
        return (
          <AutomationAccountSelect
            key={platform}
            label={t(
              platform === 'facebook'
                ? 'facebook_automation_page'
                : 'select_instagram_account'
            )}
            value={selected?.integrationId || ''}
            accounts={accounts}
            connection={
              selected && (
                <SharedConnectionIndicator
                  integrationId={selected.integrationId}
                  provider={platform}
                  messenger={messenger}
                />
              )
            }
            disabled={disabled}
            onChange={(integrationId) => {
              const others = channels.filter(
                (c) => c.integrationId !== selected?.integrationId
              );
              setChannels(
                integrationId
                  ? [
                      ...others,
                      {
                        integrationId,
                        postMode: messenger ? 'all' : 'specific',
                        postIds: [],
                      },
                    ]
                  : others
              );
              setDirty(true);
              setProblems([]);
            }}
          />
        );
      })}

      {channelViews.map((channel) => (
        <div key={channel.integrationId} className="space-y-3">
          <SharedChannelPosts
            onPreviewChange={(posts) =>
              setPublicationPreviews((old) =>
                JSON.stringify(old[channel.integrationId]) ===
                JSON.stringify(posts)
                  ? old
                  : { ...old, [channel.integrationId]: posts }
              )
            }
            channel={channel}
            triggerType={values.triggerType}
            provider={channel.platform}
            disabled={disabled}
            onChange={(updated) => {
              setChannels(
                channels.map((c) =>
                  c.integrationId === updated.integrationId ? updated : c
                )
              );
              setDirty(true);
              setProblems([]);
            }}
          />
        </div>
      ))}
    </section>
  );
  const visibleProblems = validateSharedDraft(name, channels, definition);
  const quickEditor = !advanced;
  const editorHeader = problems.length > 0 && (
    <div
      role="alert"
      className="rounded-xl border border-amber-600/40 bg-amber-500/5 p-4 text-sm space-y-2"
    >
      {problems.map((problem, index) => (
        <p key={index}>
          {errorMessage(problem.code)}{' '}
          {problem.nodeId && (
            <button
              className="underline"
              onClick={() => {
                navigation.onModeChange('flow');
                setFocusNode(problem.nodeId);
              }}
            >
              {t('shared_review_node')}
            </button>
          )}
        </p>
      ))}
    </div>
  );
  const triggerField = facebookOnly && (
    <label className="block text-sm space-y-2">
      <span>{t('messenger_trigger_select')}</span>
      <select
        aria-label={t('messenger_trigger_select')}
        className={inputClass}
        disabled={disabled || !compatible || !!id}
        value={values.triggerType}
        onChange={(e) => {
          const triggerType = e.target.value as AutomationTriggerType;
          const isMessenger = triggerType === 'messenger_message';
          if (
            !id &&
            [
              t('automation_name_message'),
              t('automation_name_facebook_comment'),
            ].includes(name)
          )
            setName(
              t(
                isMessenger
                  ? 'automation_name_message'
                  : 'automation_name_facebook_comment'
              )
            );
          setGraph(
            simpleDefinition({
              ...values,
              triggerType,
              priority: isMessenger ? 10 : undefined,
              reply: '',
              replyMessages: undefined,
            })
          );
          setPublicReply(false);
          setPreviewTab('dm');
          setChannels(
            channels.map((c) => ({
              ...c,
              postMode: isMessenger ? 'all' : 'specific',
              postIds: [],
            }))
          );
        }}
      >
        <option value="comment_on_post">
          {t('messenger_trigger_comments')}
        </option>
        <option value="messenger_message">
          {t('messenger_trigger_message')}
        </option>
      </select>
      {messenger && (
        <span className="block text-xs text-newTextColor/60">
          {t('messenger_trigger_hint')}
        </span>
      )}
    </label>
  );
  const quickFields = (
    <div className="space-y-6 min-w-0">
      <section className="space-y-4">
        <h2 className="font-semibold">{t('automation_section_account')}</h2>
        {triggerField}
        {channelEditor}
      </section>
      <section className="border-t border-newTableBorder pt-6 space-y-3">
        <h2 className="font-semibold">{t('automation_section_conditions')}</h2>
        <AutomationKeywordConditions
          specific={keywordSpecific || values.keywords.length > 0}
          keywords={values.keywords}
          onSpecificChange={setKeywordSpecific}
          onKeywordsChange={(keywords) => editSimple({ keywords })}
          requireKeywords={messenger}
          disabled={disabled}
          matchMode={values.matchMode}
          onMatchModeChange={(matchMode) => editSimple({ matchMode })}
          onFocus={() => setPreviewTab(messenger ? 'dm' : 'comments')}
        />
        {messenger && (
          <details className="rounded-lg border border-newTableBorder p-3 text-sm">
            <summary className="cursor-pointer font-medium">
              {t('automation_advanced')}
            </summary>
            <div className="pt-3">
              <MessengerPriority
                disabled={disabled}
                value={values.priority}
                onChange={(priority) => editSimple({ priority })}
              />
            </div>
          </details>
        )}
      </section>
      <section className="border-t border-newTableBorder pt-6 space-y-4">
        {messenger && (
          <h2 className="font-semibold">{t('automation_section_response')}</h2>
        )}
        {!messenger && (
          <AutomationPublicReplyToggle
            enabled={hasPublicReply}
            disabled={disabled}
            label={t('shared_add_public_reply')}
            onChange={(enabled) => {
              setPublicReply(enabled);
              setPreviewTab('comments');
              if (!enabled) {
                editSimple({ reply: '', replyMessages: undefined });
                setPreviewTab('dm');
              }
            }}
          />
        )}
        {!messenger && hasPublicReply && (
          <SharedReplyVariations
            disabled={disabled}
            messages={replyMessages}
            onChange={(messages) =>
              editSimple({ reply: '', replyMessages: messages })
            }
            onFocus={(index) => {
              setReplyPreviewIndex(index);
              setPreviewTab('comments');
            }}
          />
        )}
        {!messenger && (
          <div className="flex items-center justify-between text-xs text-newTextColor/70">
            <span>{t('automation_direct_delivery')}</span>
            <AutomationContextHelp label={t('automation_delivery_help')}>
              {t('automation_direct_delivery_hint')}
            </AutomationContextHelp>
          </div>
        )}

        <PrivateMessageVariations
          engine="shared"
          messenger={messenger}
          messages={privateMessages}
          disabled={disabled}
          maxLength={values.buttonText ? 640 : 2000}
          onFocus={(index) => {
            setDmPreviewIndex(index);
            setPreviewTab('dm');
          }}
          onChange={(messages) =>
            editSimple(
              messages.length > 1
                ? { message: '', dmMessages: messages }
                : { message: messages[0], dmMessages: undefined }
            )
          }
        />
        <div className="flex justify-between gap-3 text-xs text-newTextColor/60">
          <AutomationContextHelp
            align="start"
            label={t('automation_link_help')}
          >
            {t(messenger ? 'messenger_message_hint' : 'shared_link_hint')}
          </AutomationContextHelp>
          <span className="shrink-0"></span>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setPreviewTab('dm');
            setShowAddLink(true);
          }}
          className="rounded border border-dashed border-newTableBorder text-[12px] text-textColor px-3.5 py-2 hover:bg-boxHover disabled:opacity-50"
        >
          {values.buttonText && values.buttonUrl
            ? `${values.buttonText} · ${values.buttonUrl}`
            : `+ ${t('story_add_link')}`}
        </button>
        <AddLinkModal
          open={showAddLink}
          initialText={values.buttonText}
          initialUrl={values.buttonUrl}
          maxTextLength={20}
          onSave={(buttonText, buttonUrl) =>
            editSimple({ buttonText, buttonUrl })
          }
          onClose={() => setShowAddLink(false)}
          onRemove={() => {
            editSimple({ buttonText: '', buttonUrl: '' });
            setShowAddLink(false);
          }}
        />
      </section>
    </div>
  );
  const wrap = (content: React.ReactNode) => (
    <AutomationWorkspace
      name={name}
      nameLabel={t('flow_name')}
      onNameChange={(value) => {
        setName(value);
        setDirty(true);
        setProblems([]);
      }}
      picture={
        available?.find((a) => a.id === channels[0]?.integrationId)?.picture ||
        undefined
      }
      subtitle={`${channelViews.map((c) => c.name).join(' / ')} · ${t(
        messenger
          ? 'automation_name_message'
          : 'automation_name_facebook_comment'
      )}`}
      status={recordStatus}
      dirty={dirty}
      busy={busy}
      pendingAction={pendingAction}
      valid={!visibleProblems.length}
      problems={visibleProblems.map((problem) => errorMessage(problem.code))}
      impact={t('automation_active_edit_hint')}
      error={actionError}
      onSave={() => void save(false)}
      onStatusChange={(next) => void status(next)}
      navigation={{
        ...navigation,
        mode: workspaceMode,
        quickDisabled: !compatible,
        historyDisabled: !id,
      }}
      history={id ? <SharedFlowHistory id={id} /> : undefined}
    >
      {content}
    </AutomationWorkspace>
  );

  if (quickEditor) {
    return wrap(
      <AutomationEditorLayout>
        <section
          aria-label={t('shared_configuration')}
          className="flex flex-col min-w-0 w-full lg:w-[600px] lg:max-w-[55%] lg:shrink-0 lg:min-h-0 bg-newBgColorInner"
        >
          <div className="p-6 space-y-6 lg:flex-1 lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain">
            {editorHeader}
            {quickFields}
          </div>
        </section>
        <AutomationPreviewPanel>
          {!messenger &&
            (previewTab === 'post' || previewTab === 'comments') && (
              <PublicationPreviewControls
                posts={previewPosts}
                value={selectedPost?.id}
                onChange={setPreviewPublicationId}
              />
            )}
          {channelViews.length > 1 && (
            <select
              className={inputClass}
              aria-label={t('shared_preview_channel')}
              value={preview?.integrationId}
              onChange={(e) => setPreviewChannel(e.target.value)}
            >
              {channelViews.map((c) => (
                <option key={c.integrationId} value={c.integrationId}>
                  {c.platform === 'facebook' ? 'Facebook' : 'Instagram'} ·{' '}
                  {c.name}
                </option>
              ))}
            </select>
          )}

          <AutomationPhoneFrame>
            <WizardPhonePreview
              platform={
                preview?.platform === 'facebook' ? 'facebook' : 'instagram'
              }
              postScope={preview?.postMode}
              postIsReel={selectedPost?.permalink?.includes('/reel/')}
              postSelected={!!selectedPost && !messenger}
              postThumb={selectedPost?.thumbnailUrl || selectedPost?.mediaUrl}
              postCaption={selectedPost?.caption}
              postMediaType={
                selectedPost?.thumbnailUrl ? undefined : selectedPost?.mediaType
              }
              singleReply
              replyMessage={
                hasPublicReply ? replyMessages[currentReplyIndex] : ''
              }
              activeTab={previewTab}
              triggerType={messenger ? 'messenger_message' : 'comment_on_post'}
              triggerText={values.keywords[0]}
              journey={
                messenger
                  ? {
                      incomingMessage:
                        values.keywords[0] || t('automation_preview_incoming'),
                    }
                  : undefined
              }
              onTabChange={setPreviewTab}
              dmMessage={
                privateMessages[
                  Math.min(dmPreviewIndex, privateMessages.length - 1)
                ]
              }
              dmButtonText={values.buttonText}
              dmButtonUrl={values.buttonUrl}
              integrationName={preview?.name}
              integrationPicture={preview?.picture || undefined}
            />
          </AutomationPhoneFrame>
        </AutomationPreviewPanel>
      </AutomationEditorLayout>
    );
  }
  return wrap(
    <div className="automation-editor p-4 md:p-6 space-y-5 text-textColor w-full min-w-0 flex-1 overflow-y-auto">
      {editorHeader}
      {triggerField}
      <div className="space-y-4">
        {compatible ? (
          <details className="rounded-xl border border-newTableBorder p-4">
            <summary className="cursor-pointer text-sm font-medium">
              {t('shared_channels')} ·{' '}
              {channelViews.map((c) => c.name).join(' / ')}
            </summary>
            <div className="mt-4">{channelEditor}</div>
          </details>
        ) : (
          channelEditor
        )}
        {!compatible && (
          <p className="text-sm text-newTextColor/60">
            {t('shared_advanced_kept')}
          </p>
        )}
        <SharedFlowCanvas
          definition={definition}
          channels={channelViews}
          onChange={setGraph}
          disabled={disabled}
          focusNodeId={focusNode}
        />
      </div>
    </div>
  );
}
