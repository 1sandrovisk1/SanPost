'use client';
import {
  AutomationPreviewPanel,
  AutomationPhoneFrame,
} from './shared-editor-preview.component';
import { AutomationAccountSelect } from './shared-account-select.component';
import { MessengerPriority } from './messenger-priority.component';
import { useEffect, useMemo, useState } from 'react';
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
    data: flow,
    mutate,
    error,
    isLoading,
  } = useSharedFlowData<SharedFlowView>(id ? `/flows-v2/${id}` : null);
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
  const instagramOnly = platforms.size === 1 && platforms.has('instagram');
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
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  usePreventWindowUnload(dirty);
  const [showHistory, setShowHistory] = useState(
    params.get('tab') === 'history'
  );
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
    if (flow && !dirty) {
      setName(flow.name);
      setChannels(flow.channels);
      setDefinition(flow.definition);
      setKeywordSpecific(simpleValues(flow.definition).values.keywords.length > 0);
      setAdvanced(!simpleValues(flow.definition).compatible);
      setPublicReply(
        flow.definition.nodes.some((n) => n.type === 'REPLY_COMMENT')
      );
    }
  }, [flow, dirty]);
  useEffect(() => {
    if (
      !id &&
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
  const disabled =
    busy || flow?.status === 'ARCHIVED';
  const { values, compatible } = simpleValues(definition);
  const messenger = values.triggerType === 'messenger_message';
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
  const perform = async (path: string, method: string, body: unknown) => {
    const response = await fetchApi(path, {
      method,
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const code = sharedFailureCode(response.status, data);
      const failure = new Error(code);
      if (
        ['MESSENGER_RULE_CONFLICT', 'MESSENGER_PRIORITY_CONFLICT'].includes(
          code
        ) &&
        typeof data.conflictingFlowName === 'string'
      )
        Object.assign(failure, {
          conflictingFlowName: data.conflictingFlowName.slice(0, 200),
        });
      throw failure;
    }
    return data;
  };
  const save = async () => {
    const invalid = validateSharedDraft(name, channels, definition);
    setProblems(invalid);
    setActionError(null);
    if (invalid.length) return;
    setBusy(true);
    try {
      const saved = await perform(
        id ? `/flows-v2/${id}` : '/flows-v2',
        id ? 'PUT' : 'POST',
        {
          name: name.trim(),
          channels: channels.map((c) => ({
            integrationId: c.integrationId,
            postMode: c.postMode,
            postIds: c.postIds,
            ...(c.postMode === 'scheduled' ? { scheduledPostId: c.scheduledPostId } : {}),
          })),
          definition: normalizeDefinition(definition),
          expectedRevision: flow?.revision,
        }
      );
      setDirty(false);
      if (!id) router.replace(`/automacoes/compartilhada/${saved.id}`);
      else await mutate(saved, false);
      toaster.show(t('flow_saved'), 'success');
    } catch (err) {
      setActionError(
        errorMessage(err instanceof Error ? err.message : '') +
          (err && typeof err === 'object' && 'conflictingFlowName' in err
            ? ` · ${String(err.conflictingFlowName)}`
            : '')
      );
    } finally {
      setBusy(false);
    }
  };
  const status = async () => {
    if (!flow) return;
    setBusy(true);
    setActionError(null);
    try {
      const updated = await perform(`/flows-v2/${flow.id}/status`, 'POST', {
        expectedRevision: flow.revision,
        status: flow.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE',
      });
      await mutate(updated, false);
    } catch (err) {
      setActionError(
        errorMessage(err instanceof Error ? err.message : '') +
          (err && typeof err === 'object' && 'conflictingFlowName' in err
            ? ` · ${String(err.conflictingFlowName)}`
            : '')
      );
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
          .map((c) => ({ id: c.id, name: c.name }));
        if (selected && !accounts.some((a) => a.id === selected.integrationId))
          accounts.push({
            id: selected.integrationId,
            name: selected.name || t('automation_account_unavailable'),
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
  const quickEditor = !showHistory && !advanced;
  const editorHeader = (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <a
            href="/automacoes"
            className="text-sm text-newTextColor/60 hover:underline"
          >
            ← {t('automacoes')}
          </a>
          <h1 className="text-xl font-semibold mt-2">
            {facebookOnly
              ? t(
                  id
                    ? 'facebook_automation_edit_title'
                    : 'facebook_automation_create_title'
                )
              : quickEditor
              ? t(id ? 'wizard_editing_title' : 'wizard_title')
              : flow?.name || t('shared_creator_title')}
          </h1>
          <p className="text-sm text-newTextColor/60 mt-1">
            {t(
              facebookOnly
                ? 'facebook_automation_creator_intro'
                : instagramOnly
                ? 'instagram_automation_creator_intro'
                : 'shared_creator_intro'
            )}
          </p>
        </div>
        {flow && (
          <span
            className={`rounded-full px-3 py-1 text-xs ${
              flow.status === 'ACTIVE'
                ? 'bg-green-500/10 text-green-600'
                : 'bg-boxHover text-newTextColor/70'
            }`}
          >
            {t(`flow_status_${flow.status.toLowerCase()}`)}
          </span>
        )}
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-newTableBorder pb-3">
        <nav className="flex gap-2" aria-label={t('shared_editor_sections')}>
          <button
            className={`px-3 py-2 rounded-lg text-sm ${
              !showHistory
                ? 'bg-boxHover font-semibold'
                : 'text-newTextColor/60'
            }`}
            aria-pressed={!showHistory}
            onClick={() => setShowHistory(false)}
          >
            {t('shared_configuration')}
          </button>
          {id && (
            <button
              className={`px-3 py-2 rounded-lg text-sm ${
                showHistory
                  ? 'bg-boxHover font-semibold'
                  : 'text-newTextColor/60'
              }`}
              aria-pressed={showHistory}
              onClick={() => setShowHistory(true)}
            >
              {t('show_history')}
            </button>
          )}
        </nav>
        {!showHistory && (
          <button
            type="button"
            className="text-sm underline disabled:opacity-50"
            disabled={advanced && !compatible}
            onClick={() => setAdvanced(!advanced)}
          >
            {advanced ? t('shared_simple') : t('shared_canvas')}
          </button>
        )}
      </div>
      {!showHistory && flow?.status === 'ACTIVE' && (
        <p className="text-sm text-newTextColor/70">{t('automation_active_edit_hint')}</p>
      )}
      {(problems.length > 0 || actionError) && (
        <div
          role="alert"
          className="rounded-xl border border-amber-600/40 bg-amber-500/5 p-4 text-sm space-y-2"
        >
          {actionError && <p>{actionError}</p>}
          {problems.map((problem, index) => (
            <p key={index}>
              {errorMessage(problem.code)}{' '}
              {problem.nodeId && (
                <button
                  className="underline"
                  onClick={() => {
                    setAdvanced(true);
                    setFocusNode(problem.nodeId);
                  }}
                >
                  {t('shared_review_node')}
                </button>
              )}
            </p>
          ))}
        </div>
      )}
    </>
  );
  const nameField = (
    <label className="block max-w-xl text-sm space-y-2" id="shared-name">
      {t('flow_name')}
      <input
        className={inputClass}
        disabled={disabled}
        maxLength={200}
        value={name}
        aria-invalid={problems.some((p) => p.field === 'name')}
        onChange={(e) => {
          setName(e.target.value);
          setDirty(true);
          setProblems([]);
        }}
      />
    </label>
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
        <AutomationKeywordConditions specific={keywordSpecific || values.keywords.length > 0} keywords={values.keywords} onSpecificChange={setKeywordSpecific} onKeywordsChange={keywords => editSimple({ keywords })} requireKeywords={messenger} disabled={disabled} matchMode={values.matchMode} onMatchModeChange={matchMode => editSimple({ matchMode })} onFocus={() => setPreviewTab(messenger ? 'dm' : 'comments')} />
        {!messenger && (
          <AutomationPublicReplyToggle
            enabled={hasPublicReply}
            disabled={disabled}
            label={t('shared_add_public_reply')}
            onChange={(enabled) => {
              setPublicReply(enabled);
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
        <h2 className="font-semibold">{t('automation_section_response')}</h2>
        <label className="block text-sm space-y-2">
          {t('shared_message')}
          <textarea
            disabled={disabled}
            className={inputClass}
            rows={5}
            maxLength={values.buttonText ? 640 : 2000}
            placeholder={t('automation_private_message_placeholder')}
            value={values.message}
            onFocus={() => setPreviewTab('dm')}
            onChange={(e) => editSimple({ message: e.target.value })}
          />
        </label>
        <div className="flex justify-between gap-3 text-xs text-newTextColor/60">
          <p>{t(messenger ? 'messenger_message_hint' : 'shared_link_hint')}</p>
          <span className="shrink-0">
            {values.message.length}/{values.buttonText ? 640 : 2000}
          </span>
        </div>
        <button type="button" disabled={disabled} onClick={() => setShowAddLink(true)} className="rounded border border-dashed border-newTableBorder text-[12px] text-textColor px-3.5 py-2 hover:bg-boxHover disabled:opacity-50">{values.buttonText && values.buttonUrl ? `${values.buttonText} · ${values.buttonUrl}` : `+ ${t('story_add_link')}`}</button>
        <AddLinkModal open={showAddLink} initialText={values.buttonText} initialUrl={values.buttonUrl} maxTextLength={20} onSave={(buttonText, buttonUrl) => editSimple({ buttonText, buttonUrl })} onClose={() => setShowAddLink(false)} onRemove={() => { editSimple({ buttonText: '', buttonUrl: '' }); setShowAddLink(false); }} />
      </section>
    </div>
  );
  const actions = (
    <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-newTableBorder bg-newBgColorInner p-4 shrink-0">
      <p className="text-xs text-newTextColor/60">
        {dirty
          ? t('shared_unsaved')
          : !id
          ? t('shared_save_before_activate')
          : flow?.status === 'ACTIVE'
          ? t('shared_is_active')
          : t('shared_review_activate')}
      </p>
      <div className="flex gap-2">
        <Button secondary disabled={disabled} onClick={save}>
          {busy ? t('saving_flow') : t('save_flow')}
        </Button>
        {id && flow?.status !== 'ARCHIVED' && (
          <Button disabled={busy || dirty} onClick={status}>
            {flow?.status === 'ACTIVE' ? t('pause_flow') : t('activate_flow')}
          </Button>
        )}
      </div>
    </footer>
  );
  if (quickEditor) {
    return (
      <div className="automation-editor flex flex-col lg:flex-row flex-1 min-w-0 w-full text-textColor lg:h-[calc(100dvh-105px)] lg:min-h-[480px]">
        <section
          aria-label={t('shared_configuration')}
          className="flex flex-col min-w-0 w-full lg:w-[600px] lg:max-w-[55%] lg:shrink-0 bg-newBgColorInner"
        >
          <div className="p-6 space-y-6 lg:flex-1 lg:min-h-0 lg:overflow-y-auto">
            {editorHeader}
            {nameField}
            {quickFields}
          </div>
          {actions}
        </section>
        <AutomationPreviewPanel>
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
          <span className="text-xs text-newTextColor/60">
            {preview?.platform === 'facebook'
              ? 'Messenger'
              : preview
              ? 'Instagram'
              : t('shared_message')}
          </span>
          {hasPublicReply && replyMessages.length > 1 && (
            <label className="block w-full text-xs space-y-1">
              <span>{t('shared_reply_preview')}</span>
              <select
                className={inputClass}
                value={currentReplyIndex}
                onChange={(e) => {
                  setReplyPreviewIndex(Number(e.target.value));
                  setPreviewTab('comments');
                }}
              >
                {replyMessages.map((_, index) => (
                  <option key={index} value={index}>
                    {t('shared_reply_variant')} {index + 1}
                  </option>
                ))}
              </select>
            </label>
          )}
          <AutomationPhoneFrame>
            <WizardPhonePreview
              singleReply
              replyMessage={
                hasPublicReply ? replyMessages[currentReplyIndex] : ''
              }
              activeTab={
                previewTab === 'comments' && !replyMessages[currentReplyIndex]
                  ? 'dm'
                  : previewTab
              }
              onTabChange={setPreviewTab}
              dmMessage={values.message}
              dmButtonText={values.buttonText}
              dmButtonUrl={values.buttonUrl}
              integrationName={preview?.name}
              integrationPicture={preview?.picture || undefined}
            />
          </AutomationPhoneFrame>
        </AutomationPreviewPanel>
      </div>
    );
  }
  return (
    <div className="automation-editor p-4 md:p-6 space-y-5 text-textColor max-w-[1280px] w-full mx-auto min-w-0">
      {editorHeader}
      {showHistory && id ? (
        <SharedFlowHistory id={id} />
      ) : (
        <>
          {nameField}
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
          {actions}
        </>
      )}
    </div>
  );
}
