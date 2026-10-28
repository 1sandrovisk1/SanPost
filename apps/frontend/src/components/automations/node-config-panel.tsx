'use client';
import { AutomationPublicReplyToggle } from './shared-public-reply-toggle.component';
import { AutomationFollowGateFields } from './shared-response-controls.component';
import { useAliases } from './hooks/use-unmatched-comments';
import { PrivateMessageVariations } from './shared-private-variations.component';

import { AutomationMessageVariables } from './shared-message-variables.component';
import { AutomationPublicationSelector } from './shared-publication-selector.component';
import { FC, useCallback, useState, useEffect, useId } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { AdAliasesField } from '@gitroom/frontend/components/automations/ad-aliases-field.component';
import { CommaSeparatedKeywordsInput } from '@gitroom/frontend/components/automations/comma-separated-keywords-input.component';

interface NodeConfigPanelProps {
  node: any;
  flowId: string;
  integrationId: string;
  onUpdate: (nodeId: string, data: Record<string, any>) => void;
  onClose: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  disabled?: boolean;
}

// Mantidos em sync com os defaults do automation-wizard.component.tsx.
const FOLLOW_GATE_DEFAULT_PT =
  'Olá! Esse conteúdo é exclusivo para seguidores. Me segue aqui e responde o story de novo para eu te enviar 💙';
const OPENING_DM_DEFAULT_PT =
  'Obrigado pelo interesse! Clique no botão abaixo para receber o link.';
const OPENING_DM_BTN_DEFAULT_PT = 'Quero o link';
const ALREADY_FOLLOWED_BTN_DEFAULT_PT = 'Já segui! 💙';
const GATE_EXHAUSTED_DEFAULT_PT =
  'Não consegui confirmar que você está seguindo. Tente novamente mais tarde 😉';
const DEFAULT_MAX_GATE_ATTEMPTS = 3;

interface InstagramPost {
  id: string;
  caption?: string;
  mediaType: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  permalink?: string;
  timestamp?: string;
}

const useFlowPosts = (flowId: string, enabled: boolean) => {
  const fetch = useFetch();
  return useSWR<InstagramPost[]>(
    enabled ? `/flows/${flowId}/posts` : null,
    async (url: string) => {
      const res = await fetch(url);
      return res.json();
    }
  );
};

const EXAMPLE_CHIPS = ['Preço', 'Link', 'Comprar'];

const KeywordsField: FC<{
  t: (key: string, fallback: string) => string;
  keywords: string[];
  matchMode: string;
  onKeywordsChange: (kws: string[]) => void;
  onMatchModeChange: (m: string) => void;
  inputClass: string;
  inputWrapperClass: string;
}> = ({
  t,
  keywords,
  matchMode,
  onKeywordsChange,
  onMatchModeChange,
  inputClass,
  inputWrapperClass,
}) => (
  <div>
    <label className="block text-[13px] font-semibold text-textColor mb-[8px]">
      {t('trigger_keywords', 'Palavras-chave')}
    </label>
    {/* Comma-separated input */}
    <div className={inputWrapperClass}>
      <CommaSeparatedKeywordsInput
        className={inputClass + ' h-[42px]'}
        placeholder={t(
          'wizard_keywords_input_placeholder',
          'Digite uma ou mais palavras'
        )}
        keywords={keywords}
        onKeywordsChange={onKeywordsChange}
      />
    </div>
    <p className="text-[11px] text-customColor18 mt-[4px] mb-[8px]">
      {t('wizard_keywords_comma_hint', 'Use vírgulas para separar as palavras')}
    </p>
    {/* Example chips */}
    <div className="flex flex-wrap gap-[6px] mb-[10px]">
      <span className="text-[11px] text-customColor18">
        {t('wizard_example', 'Por exemplo:')}
      </span>
      {EXAMPLE_CHIPS.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => {
            if (!keywords.includes(chip)) onKeywordsChange([...keywords, chip]);
          }}
          className={`text-[11px] px-[8px] py-[2px] rounded-[12px] border ${
            keywords.includes(chip)
              ? 'border-btnPrimary text-btnPrimary bg-btnPrimary/10'
              : 'border-fifth text-customColor18 hover:border-btnPrimary'
          }`}
        >
          {chip}
        </button>
      ))}
    </div>
    {/* Match mode — only shown when keywords exist */}
    {keywords.length > 0 && (
      <div className={inputWrapperClass}>
        <select
          className={inputClass}
          value={matchMode}
          onChange={(e) => onMatchModeChange(e.target.value)}
        >
          <option value="any">
            {t('match_any', 'Qualquer palavra-chave')}
          </option>
          <option value="all">
            {t('match_all', 'Todas as palavras-chave')}
          </option>
          <option value="exact">
            {t('match_exact', 'Correspondência exata')}
          </option>
        </select>
      </div>
    )}
  </div>
);

export const NodeConfigPanel: FC<NodeConfigPanelProps> = ({
  node,
  flowId,
  integrationId,
  onUpdate,
  onClose,
  onDirtyChange,
  disabled = false,
}) => {
  const t = useT();
  const messageId = useId();
  const [baseline, setBaseline] = useState('{}');
  const [config, setConfig] = useState<Record<string, any>>({});

  useEffect(() => {
    try {
      const parsed =
        typeof node.data?.config === 'string'
          ? JSON.parse(node.data.config)
          : node.data?.config || {};
      setConfig(parsed);
      setBaseline(JSON.stringify(parsed));
    } catch {
      setConfig({});
      setBaseline('{}');
    }
  }, [node]);

  useEffect(() => {
    onDirtyChange?.(JSON.stringify(config) !== baseline);
  }, [config, baseline, onDirtyChange]);
  const handleSave = useCallback(() => {
    onDirtyChange?.(false);
    onUpdate(node.id, config);
  }, [node.id, config, onUpdate, onDirtyChange]);

  const inputClass =
    'w-full bg-transparent outline-none text-[14px] text-textColor px-[16px] py-[10px]';
  const inputWrapperClass =
    'bg-newBgColorInner border border-newTableBorder rounded-[8px]';

  const { data: posts, isLoading: postsLoading } = useFlowPosts(
    flowId,
    node.type === 'trigger'
  );

  const { data: aliases } = useAliases(node.type === 'trigger' ? flowId : null);
  const fetchApi = useFetch();
  const { data: flowSummary } = useSWR<{ integrationId: string }>(
    flowId && node.type === 'trigger' ? `/flows/${flowId}` : null,
    (path: string) => fetchApi(path).then((r) => r.json())
  );

  const selectedPostIds: string[] = config.postIds || [];
  const togglePost = (postId: string) => {
    const set = new Set(selectedPostIds);
    if (set.has(postId)) {
      set.delete(postId);
    } else {
      set.add(postId);
    }
    setConfig({ ...config, postIds: Array.from(set) });
  };

  const renderFields = () => {
    switch (node.type) {
      case 'trigger': {
        const triggerType: 'comment_on_post' | 'story_reply' =
          config.triggerType === 'story_reply'
            ? 'story_reply'
            : 'comment_on_post';
        const currentMode:
          | 'all'
          | 'specific'
          | 'next_publication'
          | 'scheduled' =
          config.mode === 'scheduled'
            ? 'scheduled'
            : config.mode === 'next_publication'
            ? 'next_publication'
            : config.mode === 'specific' ||
              (Array.isArray(config.postIds) && config.postIds.length > 0) ||
              (Array.isArray(config.storyIds) && config.storyIds.length > 0)
            ? 'specific'
            : 'all';

        const setTriggerType = (type: 'comment_on_post' | 'story_reply') => {
          const next: Record<string, any> = { ...config, triggerType: type };
          // Clear id list from the other type to avoid stale references
          if (type === 'comment_on_post') delete next.storyIds;
          if (type === 'story_reply') {
            delete next.postIds;
            delete next.scheduledPostId;
            if (next.mode === 'scheduled') next.mode = 'all';
          }
          setConfig(next);
        };

        const setMode = (
          mode: 'all' | 'specific' | 'next_publication' | 'scheduled'
        ) => {
          const next: Record<string, any> = { ...config, mode };
          if (mode !== 'scheduled') delete next.scheduledPostId;
          if (mode !== 'specific') {
            delete next.postIds;
            delete next.storyIds;
          }
          setConfig(next);
        };

        const selectedStoryIds: string[] = Array.isArray(config.storyIds)
          ? config.storyIds
          : [];

        return (
          <>
            {/* Trigger type switch */}
            <label className="block text-[13px] font-semibold text-textColor mb-[8px]">
              {t('trigger_type_label', 'Tipo de gatilho')}
            </label>
            <div className="flex flex-col gap-[6px] mb-[16px]">
              {(
                [
                  [
                    'comment_on_post',
                    t('trigger_type_comment', 'Comentario em publicacao'),
                  ],
                  ['story_reply', t('trigger_type_story', 'Resposta ao story')],
                ] as const
              ).map(([value, label]) => (
                <label
                  key={value}
                  className={`flex items-center gap-[8px] p-[8px] rounded-[6px] border cursor-pointer ${
                    triggerType === value
                      ? 'border-btnPrimary bg-btnPrimary/10'
                      : 'border-newTableBorder hover:border-btnPrimary'
                  }`}
                >
                  <input
                    type="radio"
                    checked={triggerType === value}
                    onChange={() => setTriggerType(value)}
                  />
                  <span className="text-[13px] text-textColor">{label}</span>
                </label>
              ))}
            </div>

            {triggerType === 'story_reply' && (
              <>
                {/* Mode */}
                <label className="block text-[13px] font-semibold text-textColor mb-[8px]">
                  {triggerType === 'story_reply'
                    ? t('story_section_when', 'Quando alguem responder')
                    : t('trigger_posts_label', 'Posts monitorados')}
                </label>
                <div className="flex flex-col gap-[6px] mb-[12px]">
                  <label
                    className={`flex items-center gap-[8px] p-[8px] rounded-[6px] border cursor-pointer ${
                      currentMode === 'all'
                        ? 'border-btnPrimary bg-btnPrimary/10'
                        : 'border-newTableBorder hover:border-btnPrimary'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={currentMode === 'all'}
                      onChange={() => setMode('all')}
                    />
                    <span className="text-[13px] text-textColor">
                      {triggerType === 'story_reply'
                        ? t('story_mode_all', 'Qualquer story')
                        : t('trigger_posts_all', 'Todos os posts')}
                    </span>
                  </label>
                  <label
                    className={`flex items-center gap-[8px] p-[8px] rounded-[6px] border cursor-pointer ${
                      currentMode === 'next_publication'
                        ? 'border-btnPrimary bg-btnPrimary/10'
                        : 'border-newTableBorder hover:border-btnPrimary'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={currentMode === 'next_publication'}
                      onChange={() => setMode('next_publication')}
                    />
                    <span className="text-[13px] text-textColor">
                      {triggerType === 'story_reply'
                        ? t('story_mode_next', 'Proximo story')
                        : t('post_mode_next_publication', 'Proxima publicacao')}
                    </span>
                  </label>
                  <label
                    className={`flex items-center gap-[8px] p-[8px] rounded-[6px] border cursor-pointer ${
                      currentMode === 'specific' || currentMode === 'scheduled'
                        ? 'border-btnPrimary bg-btnPrimary/10'
                        : 'border-newTableBorder hover:border-btnPrimary'
                    }`}
                  >
                    <input
                      type="radio"
                      checked={
                        currentMode === 'specific' ||
                        currentMode === 'scheduled'
                      }
                      onChange={() => setMode('specific')}
                    />
                    <span className="text-[13px] text-textColor">
                      {triggerType === 'story_reply'
                        ? t('story_mode_specific', 'Story especifico')
                        : t(
                            'summary_specific_posts_label',
                            'Posts especificos'
                          )}
                    </span>
                  </label>
                </div>
              </>
            )}
            {/* Specific selectors */}
            {triggerType === 'comment_on_post' && (
              <AutomationPublicationSelector
                showSpecificContentWhenScheduled
                scopeNote={
                  aliases?.length
                    ? t('automation_instagram_aliases_scope_hint')
                    : undefined
                }
                specificContent={
                  <details className="mt-3 rounded-lg border border-newTableBorder p-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                      {t('trigger_ad_ids_label')}
                    </summary>
                    <div className="pt-3">
                      <AdAliasesField
                        flowId={flowId}
                        integrationId={
                          flowSummary?.integrationId ?? integrationId ?? null
                        }
                      />
                    </div>
                  </details>
                }
                key={integrationId}
                integrationId={integrationId}
                mode={currentMode}
                postIds={selectedPostIds}
                scheduledPostId={config.scheduledPostId}
                posts={posts || []}
                loading={postsLoading}
                onChange={(selection) => {
                  const next: Record<string, any> = {
                    ...config,
                    mode: selection.mode,
                    postIds: selection.postIds,
                  };
                  delete next.scheduledPostId;
                  if (selection.scheduledPostId)
                    next.scheduledPostId = selection.scheduledPostId;
                  setConfig(next);
                }}
              />
            )}

            {currentMode === 'specific' && triggerType === 'story_reply' && (
              <div className="mb-[12px]">
                <p className="text-[11px] text-customColor18 mb-[6px]">
                  {t(
                    'story_mode_specific_hint',
                    'Informe o ID do story (visivel no Meta Business Suite)'
                  )}
                </p>
                <div className={inputWrapperClass}>
                  <input
                    type="text"
                    className={`${inputClass} h-[42px]`}
                    value={selectedStoryIds.join(', ')}
                    placeholder={t('story_ids_placeholder', 'ID do story')}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        storyIds: e.target.value
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
              </div>
            )}

            {/* Keywords */}
            <div className="mt-[16px]">
              <KeywordsField
                t={t}
                keywords={config.keywords || []}
                matchMode={config.matchMode || 'any'}
                onKeywordsChange={(kws) =>
                  setConfig({ ...config, keywords: kws })
                }
                onMatchModeChange={(m) =>
                  setConfig({ ...config, matchMode: m })
                }
                inputClass={inputClass}
                inputWrapperClass={inputWrapperClass}
              />
            </div>

            {/* Story-only extras */}
            {triggerType === 'story_reply' && (
              <div className="mt-[16px]">
                <label className="flex items-center justify-between gap-[8px] p-[8px] rounded-[6px] border border-newTableBorder">
                  <span className="text-[12px] text-textColor">
                    {t(
                      'story_match_reactions',
                      'Responder reacoes nos stories'
                    )}
                  </span>
                  <input
                    type="checkbox"
                    checked={config.matchReactions !== false}
                    onChange={(e) =>
                      setConfig({ ...config, matchReactions: e.target.checked })
                    }
                  />
                </label>
              </div>
            )}

            <div className="mt-4 space-y-3">
              <AutomationPublicReplyToggle
                disabled={disabled}
                enabled={!!config.requireFollow}
                label={t('story_require_follow')}
                onChange={(enabled) =>
                  setConfig({ ...config, requireFollow: enabled })
                }
              />
              {!!config.requireFollow && (
                <AutomationFollowGateFields
                  story={triggerType === 'story_reply'}
                  values={{
                    openingDmMessage:
                      config.openingDmMessage ?? OPENING_DM_DEFAULT_PT,
                    openingDmButtonText:
                      config.openingDmButtonText ?? OPENING_DM_BTN_DEFAULT_PT,
                    followGateMessage:
                      config.followGateMessage ?? FOLLOW_GATE_DEFAULT_PT,
                    alreadyFollowedButtonText:
                      config.alreadyFollowedButtonText ??
                      ALREADY_FOLLOWED_BTN_DEFAULT_PT,
                    gateExhaustedMessage:
                      config.gateExhaustedMessage ?? GATE_EXHAUSTED_DEFAULT_PT,
                    maxGateAttempts:
                      config.maxGateAttempts ?? DEFAULT_MAX_GATE_ATTEMPTS,
                  }}
                  onChange={(patch) => {
                    const attempts = patch.maxGateAttempts;
                    setConfig({
                      ...config,
                      ...patch,
                      ...(attempts === undefined
                        ? {}
                        : {
                            maxGateAttempts:
                              Number.isFinite(attempts) && attempts !== 0
                                ? Math.max(
                                    1,
                                    Math.min(10, Math.floor(attempts))
                                  )
                                : DEFAULT_MAX_GATE_ATTEMPTS,
                          }),
                    });
                  }}
                  onFocusStage={() => {}}
                />
              )}
            </div>
          </>
        );
      }

      case 'condition':
        return (
          <>
            <KeywordsField
              t={t}
              keywords={config.keywords || []}
              matchMode={config.matchMode || 'any'}
              onKeywordsChange={(kws) =>
                setConfig({ ...config, keywords: kws })
              }
              onMatchModeChange={(m) => setConfig({ ...config, matchMode: m })}
              inputClass={inputClass}
              inputWrapperClass={inputWrapperClass}
            />
          </>
        );

      case 'replyComment':
        return (
          <>
            <label className="block text-[14px] text-textColor mb-[6px]">
              {t('reply_template', 'Reply Template')}
            </label>
            <div className={inputWrapperClass}>
              <textarea
                id={messageId}
                className={`${inputClass} min-h-[100px] pb-10 resize-y`}
                rows={4}
                maxLength={2200}
                placeholder={t(
                  'reply_template_placeholder',
                  'Thanks {commenter_name} for your comment!'
                )}
                value={config.message || ''}
                onChange={(e) =>
                  setConfig({ ...config, message: e.target.value })
                }
              />
            </div>
            <AutomationMessageVariables
              textareaId={messageId}
              disabled={disabled}
              onChange={(message) => setConfig({ ...config, message })}
            />
          </>
        );

      case 'sendDm':
        return (
          <>
            <PrivateMessageVariations
              disabled={disabled}
              messages={config.messages || [config.message || '']}
              variants={config.variants}
              buttonText={config.buttonText}
              buttonUrl={config.buttonUrl}
              onVariantsChange={(variants) =>
                setConfig({
                  ...config,
                  variants,
                  message: undefined,
                  messages: undefined,
                  buttonText: undefined,
                  buttonUrl: undefined,
                })
              }
              onChange={(messages) =>
                setConfig({
                  ...config,
                  ...(messages.length > 1
                    ? { message: undefined, messages }
                    : { message: messages[0], messages: undefined }),
                })
              }
            />
            <p className="text-[11px] text-customColor18 mt-[4px]">
              {t(
                'dm_multiline_hint',
                'Use quebras de linha para separar paragrafos. A Meta permite apenas 1 mensagem direta por comentario.'
              )}
            </p>
          </>
        );

      case 'delay':
        return (
          <>
            <label className="block text-[14px] text-textColor mb-[6px]">
              {t('delay_duration', 'Delay Duration')}
            </label>
            <div className="flex gap-[8px]">
              <div className={`${inputWrapperClass} w-[80px]`}>
                <input
                  type="number"
                  className={inputClass}
                  min={0}
                  value={config.duration || 0}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      duration: parseInt(e.target.value, 10) || 0,
                    })
                  }
                />
              </div>
              <div className={`${inputWrapperClass} flex-1`}>
                <select
                  className={inputClass}
                  value={config.unit || 'seconds'}
                  onChange={(e) =>
                    setConfig({ ...config, unit: e.target.value })
                  }
                >
                  <option value="seconds">{t('seconds', 'Seconds')}</option>
                  <option value="minutes">{t('minutes', 'Minutes')}</option>
                  <option value="hours">{t('hours', 'Hours')}</option>
                </select>
              </div>
            </div>
          </>
        );

      default:
        return (
          <p className="text-[14px] text-customColor18">
            {t(
              'no_config_available',
              'No configuration available for this node'
            )}
          </p>
        );
    }
  };

  return (
    <aside
      aria-label={t('node_config')}
      className="w-full lg:w-[360px] lg:max-w-[45%] lg:shrink-0 border-b lg:border-b-0 lg:border-r border-newTableBorder bg-newBgColorInner p-4 overflow-y-auto max-h-[60dvh] lg:max-h-none lg:min-h-0"
    >
      <div className="flex items-center justify-between mb-[16px]">
        <h3 className="text-[14px] font-semibold text-textColor">
          {t('node_config', 'Node Configuration')}
        </h3>
        <button
          type="button"
          aria-label={t('close')}
          onClick={onClose}
          className="text-customColor18 hover:text-textColor text-[18px]"
        >
          &times;
        </button>
      </div>

      <fieldset disabled={disabled} className="min-w-0">
        {renderFields()}
      </fieldset>

      <p className="mt-4 text-xs text-newTextColor/60">
        {t('automation_apply_node_hint')}
      </p>
      <button
        type="button"
        disabled={disabled || JSON.stringify(config) === baseline}
        onClick={handleSave}
        className="mt-4 w-full rounded-lg bg-btnPrimary py-2 text-sm font-medium text-white hover:opacity-80 disabled:bg-newBgColor disabled:text-newTextColor/45 disabled:cursor-not-allowed"
      >
        {t('automation_apply_node')}
      </button>
    </aside>
  );
};
