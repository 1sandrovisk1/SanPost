'use client';

import { AutomationPublicReplyToggle } from './shared-public-reply-toggle.component';
import { SharedReplyVariations } from './shared-reply-variations.component';
import { AutomationKeywordConditions } from './shared-keyword-conditions.component';
import { AutomationPublicationSelector } from './shared-publication-selector.component';
import { AutomationPreviewPanel, AutomationPhoneFrame } from './shared-editor-preview.component';
import { AutomationAccountSelect } from './shared-account-select.component';
import { InstagramEditorConnection, useInstagramEditorConnection } from './shared-instagram-connection.component';
import { useAliases } from './hooks/use-unmatched-comments';
import { FC, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useIntegrationList } from '@gitroom/frontend/components/launches/helpers/use.integration.list';
import { useIntegrationPosts } from '@gitroom/frontend/components/automations/hooks/use-flows';
import { useRouter } from 'next/navigation';
import { useToaster } from '@gitroom/react/toaster/toaster';
import { WizardPhonePreview } from '@gitroom/frontend/components/automations/wizard-phone-preview.component';
import { AddLinkModal } from '@gitroom/frontend/components/automations/add-link-modal.component';
import { AdAliasesField } from '@gitroom/frontend/components/automations/ad-aliases-field.component';

const FOLLOW_GATE_DEFAULT_PT =
  'Olá! Esse conteúdo é exclusivo para seguidores. Me segue aqui e responde o story de novo para eu te enviar 💙';

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
}

function safeJson(data?: string): Record<string, any> {
  if (!data) return {};
  try { return JSON.parse(data); } catch { return {}; }
}

export const AutomationWizardComponent: FC<Props> = ({ flowId, initialFlow }) => {
  const t = useT();
  const privateMessageId = useId();
  const fetchApi = useFetch();
  const router = useRouter();
  const toaster = useToaster();
  const { data: integrations } = useIntegrationList();
  const isEditing = !!flowId;

  // Form state
  const [name, setName] = useState(() => flowId ? '' : t('automation_name_instagram_comment'));
  const [integrationId, setIntegrationId] = useState('');
  const [draftId, setDraftId] = useState<string | undefined>();
  const draftLock = useRef(false);
  const [preparingDraft, setPreparingDraft] = useState(false);
  const effectiveFlowId = flowId || draftId;
  const connection = useInstagramEditorConnection(integrationId);
  const { data: aliases } = useAliases(effectiveFlowId || null);

  const [postMode, setPostMode] = useState<'all' | 'specific' | 'next_publication' | 'scheduled'>('specific');
  const [scheduledPostId, setScheduledPostId] = useState('');
  const [selectedPostIds, setSelectedPostIds] = useState<string[]>([]);
  const hasSpecificSource = selectedPostIds.length > 0 || (Array.isArray(aliases) && aliases.length > 0);
  const [keywordMode, setKeywordMode] = useState<'any_word' | 'specific'>('any_word');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState('any');
  const [enableReply, setEnableReply] = useState(false);
  const [replyMessages, setReplyMessages] = useState<string[]>(['']);
  const [enableDm, setEnableDm] = useState(false);
  const [dmMessage, setDmMessage] = useState('');
  const [dmButtonText, setDmButtonText] = useState('');
  const [dmButtonUrl, setDmButtonUrl] = useState('');
  const [showAddLink, setShowAddLink] = useState(false);
  const [requireFollow, setRequireFollow] = useState(false);
  const [followGateMessage, setFollowGateMessage] = useState(
    FOLLOW_GATE_DEFAULT_PT
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
  const [activePreviewTab, setActivePreviewTab] = useState<'post' | 'comments' | 'dm'>('post');
  const [modalPosts, setModalPosts] = useState<any[]>([]);
  const [modalNextCursor, setModalNextCursor] = useState<string | null>(null);
  const [modalLoadingMore, setModalLoadingMore] = useState(false);

  // Pre-fill form when editing
  useEffect(() => {
    if (!initialFlow) return;
    setName(initialFlow.name || '');
    setIntegrationId(initialFlow.integrationId || initialFlow.integration?.id || '');
    const triggerNode = initialFlow.nodes?.find((n: any) => n.type === 'TRIGGER');
    const replyNode = initialFlow.nodes?.find((n: any) => n.type === 'REPLY_COMMENT');
    const dmNode = initialFlow.nodes?.find((n: any) => n.type === 'SEND_DM');
    const triggerCfg = safeJson(triggerNode?.data);
    const replyCfg = safeJson(replyNode?.data);
    const dmCfg = safeJson(dmNode?.data);
    if (triggerCfg.mode === 'scheduled') { setPostMode('scheduled'); setScheduledPostId(triggerCfg.scheduledPostId || ''); }
    else if (triggerCfg.mode === 'next_publication' && !triggerCfg.postIds?.length) {
      setPostMode('next_publication');
    } else if (triggerCfg.postIds?.length) {
      setPostMode('specific');
      setSelectedPostIds(triggerCfg.postIds);
    } else if (triggerCfg.mode === 'all') {
      setPostMode('all');
    }
    if (triggerCfg.keywords?.length) {
      setKeywordMode('specific');
      setKeywords(triggerCfg.keywords);
      setMatchMode(triggerCfg.matchMode || 'any');
    }
    const msgs = replyCfg.messages as string[] | undefined;
    if (msgs?.length) {
      setEnableReply(true);
      setReplyMessages(msgs);
    } else if (replyCfg.message) {
      setEnableReply(true);
      setReplyMessages([replyCfg.message]);
    }
    if (dmCfg.message) {
      setEnableDm(true);
      setDmMessage(dmCfg.message);
    }
    if (dmCfg.buttonText) setDmButtonText(dmCfg.buttonText);
    if (dmCfg.buttonUrl) setDmButtonUrl(dmCfg.buttonUrl);
    if (typeof triggerCfg.requireFollow === 'boolean') {
      setRequireFollow(triggerCfg.requireFollow);
    }
    if (typeof triggerCfg.followGateMessage === 'string') {
      setFollowGateMessage(triggerCfg.followGateMessage);
    }
    if (typeof triggerCfg.openingDmMessage === 'string') {
      setOpeningDmMessage(triggerCfg.openingDmMessage);
    }
    if (typeof triggerCfg.openingDmButtonText === 'string') {
      setOpeningDmButtonText(triggerCfg.openingDmButtonText);
    }
    if (typeof triggerCfg.alreadyFollowedButtonText === 'string') {
      setAlreadyFollowedButtonText(triggerCfg.alreadyFollowedButtonText);
    }
    if (typeof triggerCfg.gateExhaustedMessage === 'string') {
      setGateExhaustedMessage(triggerCfg.gateExhaustedMessage);
    }
    if (typeof triggerCfg.maxGateAttempts === 'number') {
      setMaxGateAttempts(triggerCfg.maxGateAttempts);
    }
  }, [initialFlow]);

  // Auto-switch preview tab based on state
  useEffect(() => {
    if (dmMessage) {
      setActivePreviewTab('dm');
    } else if (enableReply) {
      setActivePreviewTab('comments');
    } else if (selectedPostIds.length > 0) {
      setActivePreviewTab('post');
    }
  }, [dmMessage, enableReply, selectedPostIds.length]);

  const instagramIntegrations = useMemo(() => {
    if (!Array.isArray(integrations)) return [];
    return integrations.filter((i: any) => i.identifier === 'instagram');
  }, [integrations]);

  const selectedIntegration = useMemo(
    () => instagramIntegrations.find((ig: any) => ig.id === integrationId) || null,
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
    if (integrationId) void fetchApi(`/flows/integrations/${integrationId}/posts?limit=25`).then(async response => {
      if (!response.ok) return;
      const data = await response.json();
      if (!cancelled) { setModalPosts(Array.isArray(data) ? data : data.posts || []); setModalNextCursor(data.nextCursor || null); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [integrationId, fetchApi]);

  const loadMoreModalPosts = useCallback(async () => {
    if (!modalNextCursor || modalLoadingMore) return;
    setModalLoadingMore(true);
    try {
      const data = await fetchApi(
        `/flows/integrations/${integrationId}/posts?limit=25&cursor=${modalNextCursor}`
      ).then(r => r.json());
      if (postsAccount.current !== integrationId) return;
      setModalPosts(prev => [...prev, ...(data.posts ?? [])]);
      setModalNextCursor(data.nextCursor ?? null);
    } catch {
      // ignore
    } finally {
      setModalLoadingMore(false);
    }
  }, [modalNextCursor, modalLoadingMore, integrationId, fetchApi]);

  const selectedPost = useMemo(() => {
    if (!Array.isArray(posts) || selectedPostIds.length === 0) return null;
    return posts.find((p: any) => p.id === selectedPostIds[0]);
  }, [posts, selectedPostIds]);

  const canSave =
    !!name.trim() &&
    !!integrationId &&
    (isEditing || connection.ready) &&
    (postMode !== 'specific' || hasSpecificSource) &&
    (postMode !== 'scheduled' || !!scheduledPostId) &&
    !preparingDraft &&
    ((enableReply && replyMessages.some(m => m.trim())) || dmMessage.trim().length > 0) &&
    (!requireFollow ||
      (openingDmMessage.trim().length > 0 && openingDmButtonText.trim().length > 0));

  const handleSave = useCallback(async () => {
    if (!canSave) return;
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
        const msgs = replyMessages.filter(m => m.trim());
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
        const clampedAttempts = Math.max(1, Math.min(10, Math.floor(maxGateAttempts) || DEFAULT_MAX_GATE_ATTEMPTS));
        body.maxGateAttempts = clampedAttempts;
      }

      const url = effectiveFlowId ? `/flows/${effectiveFlowId}/quick-update` : '/flows/quick-create';
      const method = effectiveFlowId ? 'PUT' : 'POST';
      const res = await fetchApi(url, { method, body: JSON.stringify(body) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toaster.show(
          data.message || t('failed_to_create_flow', 'Falha ao criar automação'),
          'warning'
        );
        return;
      }
      const flow = await res.json();
      toaster.show(
        isEditing
          ? t('flow_updated', 'Automação atualizada com sucesso')
          : t('flow_created', 'Automação criada com sucesso'),
        'success'
      );
      router.push(`/automacoes/${flow.id}`);
    } catch {
      toaster.show(t('failed_to_create_flow', 'Falha ao criar automação'), 'warning');
    } finally {
      setSaving(false);
    }
  }, [
    canSave, name, integrationId, postMode, scheduledPostId, selectedPostIds,
    keywordMode, keywords, matchMode, enableReply, replyMessages,
    enableDm, dmMessage, dmButtonText, dmButtonUrl,
    requireFollow, followGateMessage,
    openingDmMessage, openingDmButtonText, alreadyFollowedButtonText, gateExhaustedMessage, maxGateAttempts,
    isEditing, effectiveFlowId, fetchApi, router, toaster, t,
  ]);

  const prepareDraft = async () => {
    if (draftLock.current || effectiveFlowId || !name.trim() || !integrationId || !connection.ready) return;
    draftLock.current = true;
    setPreparingDraft(true);
    try {
      const response = await fetchApi('/flows', { method: 'POST', body: JSON.stringify({ name: name.trim(), integrationId }) });
      if (!response.ok) throw new Error('draft_failed');
      const draft = await response.json();
      if (typeof draft.id !== 'string') throw new Error('draft_failed');
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
    <div className="automation-editor flex flex-1 min-h-0">
      {/* Left sidebar — form (internal scroll) */}
      <div className="flex-1 overflow-y-auto p-[24px] max-w-[600px]">
        <div className="flex items-center gap-[12px] mb-[24px]">
          <button
            onClick={() => router.push('/automacoes')}
            className="text-customColor18 hover:text-textColor text-[18px]"
          >
            &larr;
          </button>
          <h1 className="text-[20px] font-semibold text-textColor">
            {isEditing
              ? t('wizard_editing_title', 'Edit Quick Automation')
              : t('wizard_title', 'New Quick Automation')}
          </h1>
        </div>

        {/* Name */}
        <div className="mb-[20px]">
          <label htmlFor="automation-name" className="block text-[14px] text-textColor mb-[6px]">
            {t('wizard_name', 'Automation name')}
          </label>
          <div className={inputWrapperClass}>
            <input
              id="automation-name"
              type="text"
              className={inputClass}
              placeholder={t('wizard_name_placeholder', 'e.g. Ebook promo')}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <section className="mb-5 space-y-3">
          <h2 className="text-base font-semibold">{t('automation_section_account')}</h2>
          <p className="text-sm text-newTextColor/60">{t('automation_instagram_comment_type')}</p>
          <AutomationAccountSelect label={t('wizard_account')} value={integrationId}
            accounts={instagramIntegrations.map((ig: any) => ({ id: ig.id, name: ig.name || ig.display || ig.id }))}
            disabled={!!effectiveFlowId || preparingDraft || saving}
            onChange={(id) => { setIntegrationId(id); setSelectedPostIds([]); setScheduledPostId(''); }} />
          {instagramIntegrations.length === 0 && <a className="text-sm underline" href="/launches" target="_blank" rel="noreferrer">{t('shared_connect_channel')}</a>}
          {integrationId && <InstagramEditorConnection connection={connection} />}
          {!!effectiveFlowId && <p className="text-xs text-newTextColor/60">{t('automation_account_fixed')}</p>}
        </section>

        {/* Step 1: When someone comments */}
        {integrationId && (
          <>
            <div className="border-t border-fifth pt-[20px] mb-[20px]">
              <h2 className="text-[16px] font-semibold text-textColor mb-[12px]">
                {t('automation_section_origin')}
              </h2>

              <AutomationPublicationSelector key={integrationId} integrationId={integrationId} mode={postMode} postIds={selectedPostIds} scheduledPostId={scheduledPostId} posts={modalPosts.length ? modalPosts : Array.isArray(posts) ? posts : []} loading={postsLoading} onLoadMore={modalNextCursor ? loadMoreModalPosts : undefined} loadingMore={modalLoadingMore} onChange={selection => { setPostMode(selection.mode); setSelectedPostIds(selection.postIds); setScheduledPostId(selection.scheduledPostId || ''); setActivePreviewTab('post'); }} />

              {/* Aliases de dark posts (anuncios) — aditivo a qualquer modo */}
              <details className="mt-4 rounded-lg border border-newTableBorder p-3 text-sm">
                <summary className="cursor-pointer font-medium">{t('trigger_ad_ids_label')}</summary>
                <div className="pt-3 space-y-3">
                  {!effectiveFlowId && <>
                    <p className="text-xs text-newTextColor/60">{t('automation_prepare_draft_hint')}</p>
                    <button type="button" disabled={preparingDraft || saving || !name.trim() || !connection.ready} onClick={prepareDraft}
                      className="rounded-lg border border-newTableBorder px-3 py-2 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-btnPrimary">
                      {t(preparingDraft ? 'automation_preparing_draft' : 'automation_prepare_draft')}
                    </button>
                  </>}
                  {effectiveFlowId && <AdAliasesField flowId={effectiveFlowId} integrationId={integrationId || null} />}
                </div>
              </details>
            </div>

            {/* Section: E esse comentário possui (ManyChat style) */}
            <div className="border-t border-fifth pt-[20px] mb-[20px]">
              <h2 className="text-[16px] font-semibold text-textColor mb-[12px]">
                {t('automation_section_conditions', 'E esse comentário possui')}
              </h2>

              <AutomationKeywordConditions specific={keywordMode === 'specific'} keywords={keywords} onSpecificChange={value => setKeywordMode(value ? 'specific' : 'any_word')} onKeywordsChange={setKeywords} matchMode={matchMode} onMatchModeChange={setMatchMode} onFocus={() => setActivePreviewTab('comments')} />

              <div className="mt-3"><AutomationPublicReplyToggle enabled={enableReply} onChange={setEnableReply} label={t('shared_add_public_reply')} /></div>
              {enableReply && <div className="mt-3"><SharedReplyVariations messages={replyMessages} onChange={setReplyMessages} maxVariants={null} onFocus={() => setActivePreviewTab('comments')} /></div>}

            </div>

            {/* DM section */}
            <div className="border-t border-fifth pt-[20px] mb-[20px]">
              <h2 className="text-[16px] font-semibold text-textColor mb-[12px]">
                {t('automation_section_response')}
              </h2>
              <label htmlFor={privateMessageId} className="block text-sm mb-2">
                {t('shared_message')}
              </label>
              <div className={inputWrapperClass}>
                <textarea
                  id={privateMessageId}
                  className={`${inputClass} min-h-[100px] resize-y`}
                  rows={4}
                  placeholder={t('automation_private_message_placeholder')}
                  value={dmMessage}
                  onFocus={() => setActivePreviewTab('dm')}
                  onChange={(e) => setDmMessage(e.target.value)}
                />
              </div>
              <p className="text-[11px] text-customColor18 mt-[4px]">
                {t('variables_hint', 'Variables: {commenter_name}, {comment_text}')}
              </p>
              <p className="text-[11px] text-newTextColor/60 mt-1">
                {t('shared_link_hint')}
              </p>
              <button
                type="button"
                onClick={() => setShowAddLink(true)}
                className="mt-[10px] rounded-[4px] border border-dashed border-fifth text-[12px] text-textColor px-[14px] py-[8px] hover:bg-boxHover"
              >
                {dmButtonText && dmButtonUrl
                  ? `${dmButtonText} · ${dmButtonUrl}`
                  : `+ ${t('story_add_link', 'Adicionar um link')}`}
              </button>
            </div>

            {/* Extras — follow gate */}
            <div className="border-t border-fifth pt-[20px] mb-[20px]">
              <h2 className="text-[16px] font-semibold text-textColor mb-[12px]">
                {t('story_section_extras', 'Outros recursos para automatizar')}
              </h2>
              <div className="rounded-[6px] border border-fifth">
                <label className="flex items-center justify-between gap-[12px] p-[10px] cursor-pointer">
                  <div>
                    <div className="text-[13px] text-textColor">
                      {t(
                        'story_require_follow',
                        'Pedir para seguir antes de enviar'
                      )}
                    </div>
                    <div className="text-[11px] text-customColor18 mt-[2px]">
                      {t(
                        'story_require_follow_hint',
                        'Quando o remetente não seguir a conta, responde com uma mensagem pedindo para seguir.'
                      )}
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={requireFollow}
                    onChange={(e) => setRequireFollow(e.target.checked)}
                    className="h-[18px] w-[18px] accent-btnPrimary cursor-pointer"
                  />
                </label>
                {requireFollow && (
                  <div className="border-t border-fifth p-[10px] flex flex-col gap-[12px]">
                    <div className="rounded-[6px] border border-yellow-500/40 bg-yellow-500/10 p-[10px] flex flex-col gap-[6px]">
                      <div className="text-[12px] font-semibold text-textColor">
                        ⚠️ {t(
                          'follow_gate_warning_title',
                          'Atenção: gate de follow em 2 etapas'
                        )}
                      </div>
                      <ol className="list-decimal list-inside text-[11px] text-customColor18 space-y-[2px]">
                        <li>
                          {t(
                            'follow_gate_warning_step_1',
                            'Resposta pública no comentário'
                          )}
                        </li>
                        <li>
                          {t(
                            'follow_gate_warning_step_2',
                            'DM inicial com botão (abre janela de mensagens)'
                          )}
                        </li>
                        <li>
                          {t(
                            'follow_gate_warning_step_3',
                            'Verificação de follow após o clique'
                          )}
                        </li>
                        <li>
                          {t(
                            'follow_gate_warning_step_4',
                            'Envia o link ou convida a seguir'
                          )}
                        </li>
                      </ol>
                    </div>

                    <div className="flex flex-col gap-[6px]">
                      <label className="text-[11px] text-customColor18">
                        {t(
                          'follow_gate_opening_dm_label',
                          'DM inicial (antes de checar follow)'
                        )}
                      </label>
                      <textarea
                        value={openingDmMessage}
                        onChange={(e) => setOpeningDmMessage(e.target.value)}
                        rows={2}
                        placeholder={t(
                          'follow_gate_opening_dm_placeholder',
                          OPENING_DM_DEFAULT_PT
                        )}
                        className="w-full bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[12px] text-textColor px-[10px] py-[8px] outline-none resize-none"
                      />
                    </div>

                    <div className="flex flex-col gap-[6px]">
                      <label className="text-[11px] text-customColor18">
                        {t(
                          'follow_gate_opening_btn_label',
                          'Texto do botão inicial'
                        )}
                      </label>
                      <input
                        type="text"
                        value={openingDmButtonText}
                        onChange={(e) => setOpeningDmButtonText(e.target.value)}
                        placeholder={t(
                          'follow_gate_opening_btn_placeholder',
                          OPENING_DM_BTN_DEFAULT_PT
                        )}
                        maxLength={20}
                        className="w-full bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[12px] text-textColor px-[10px] py-[8px] outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-[6px]">
                      <label className="text-[11px] text-customColor18">
                        {t(
                          'story_follow_gate_label',
                          'Mensagem enviada para quem ainda não segue'
                        )}
                      </label>
                      <textarea
                        value={followGateMessage}
                        onChange={(e) => setFollowGateMessage(e.target.value)}
                        rows={3}
                        placeholder={t(
                          'story_follow_gate_placeholder',
                          FOLLOW_GATE_DEFAULT_PT
                        )}
                        className="w-full bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[12px] text-textColor px-[10px] py-[8px] outline-none resize-none"
                      />
                    </div>

                    <div className="flex flex-col gap-[6px]">
                      <label className="text-[11px] text-customColor18">
                        {t(
                          'follow_gate_already_btn_label',
                          'Texto do botão "Já segui"'
                        )}
                      </label>
                      <input
                        type="text"
                        value={alreadyFollowedButtonText}
                        onChange={(e) => setAlreadyFollowedButtonText(e.target.value)}
                        placeholder={t(
                          'follow_gate_already_btn_placeholder',
                          ALREADY_FOLLOWED_BTN_DEFAULT_PT
                        )}
                        maxLength={20}
                        className="w-full bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[12px] text-textColor px-[10px] py-[8px] outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-[6px]">
                      <label className="text-[11px] text-customColor18">
                        {t(
                          'follow_gate_exhausted_label',
                          'Mensagem quando tentativas esgotam'
                        )}
                      </label>
                      <textarea
                        value={gateExhaustedMessage}
                        onChange={(e) => setGateExhaustedMessage(e.target.value)}
                        rows={2}
                        placeholder={t(
                          'follow_gate_exhausted_placeholder',
                          GATE_EXHAUSTED_DEFAULT_PT
                        )}
                        className="w-full bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[12px] text-textColor px-[10px] py-[8px] outline-none resize-none"
                      />
                    </div>

                    <div className="flex flex-col gap-[6px]">
                      <label className="text-[11px] text-customColor18">
                        {t(
                          'follow_gate_max_attempts_label',
                          'Máximo de tentativas após "Já segui"'
                        )}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={maxGateAttempts}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          setMaxGateAttempts(Number.isFinite(v) ? v : DEFAULT_MAX_GATE_ATTEMPTS);
                        }}
                        className="w-full bg-newBgColorInner border border-newTableBorder rounded-[6px] text-[12px] text-textColor px-[10px] py-[8px] outline-none"
                      />
                      <span className="text-[10px] text-customColor18">
                        {t(
                          'follow_gate_max_attempts_hint',
                          'Evita loop infinito se a pessoa nunca seguir.'
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {!isEditing && <p className="mb-3 text-xs text-newTextColor/60">{t('automation_instagram_activate_hint')}</p>}
            {postMode === 'specific' && !hasSpecificSource && <p role="status" className="mb-3 text-sm text-newTextColor/70">{t('automation_choose_publication_required')}</p>}
            {/* Save button */}
            <button
              onClick={handleSave}
              disabled={!canSave || saving}
              className="w-full rounded-[6px] bg-btnPrimary py-[12px] text-[14px] font-medium text-white hover:opacity-80 disabled:opacity-50"
            >
              {saving
                ? (isEditing ? t('wizard_updating', 'Saving...') : t('wizard_saving', 'Creating automation...'))
                : (isEditing ? t('wizard_update', 'Save Changes') : t('automation_create_activate'))}
            </button>
          </>
        )}
      </div>

      {/* Right side — phone preview (fixed; the left column scrolls internally) */}
      <AutomationPreviewPanel desktopOnly>
        <AutomationPhoneFrame><WizardPhonePreview
          postThumb={selectedPost?.thumbnailUrl || selectedPost?.mediaUrl}
          postCaption={selectedPost?.caption}
          replyMessage={enableReply ? replyMessages.filter(m => m.trim())[0] : undefined}
          dmMessage={dmMessage || undefined}
          dmButtonText={dmButtonText || undefined}
          dmButtonUrl={dmButtonUrl || undefined}
          integrationPicture={(selectedIntegration as any)?.picture}
          integrationName={(selectedIntegration as any)?.name || (selectedIntegration as any)?.display}
          activeTab={activePreviewTab}
          onTabChange={(next) => {
            if (next === 'post' || next === 'comments' || next === 'dm') {
              setActivePreviewTab(next);
            }
          }}
        /></AutomationPhoneFrame>
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
    </div>
  );
};
