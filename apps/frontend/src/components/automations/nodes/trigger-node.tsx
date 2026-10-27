'use client';

import { FC, memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

export const TriggerNode: FC<NodeProps> = memo(({ data, selected }) => {
  const t = useT();
  const config =
    typeof data?.config === 'string'
      ? (() => {
          try {
            return JSON.parse(data.config as string);
          } catch {
            return {};
          }
        })()
      : data?.config || {};
  const messenger = config.triggerType === 'messenger_message';
  const triggerType: 'comment_on_post' | 'story_reply' =
    config.triggerType === 'story_reply' ? 'story_reply' : 'comment_on_post';
  const mode: 'all' | 'specific' | 'next_publication' | 'scheduled' =
    config.mode === 'scheduled' ? 'scheduled' : config.mode === 'next_publication'
      ? 'next_publication'
      : config.mode === 'specific' ||
        (Array.isArray(config.postIds) && config.postIds.length > 0) ||
        (Array.isArray(config.storyIds) && config.storyIds.length > 0)
      ? 'specific'
      : 'all';
  const postCount = Array.isArray(config.postIds) ? config.postIds.length : 0;
  const storyCount = Array.isArray(config.storyIds)
    ? config.storyIds.length
    : 0;
  const keywords: string[] = Array.isArray(config.keywords)
    ? config.keywords
    : [];

  const channels = data.channels as
    | Array<{
        platform: string;
        name: string;
        postMode: string;
        postIds: string[];
      }>
    | undefined;
  const title = messenger
    ? t('messenger_trigger_message')
    : channels?.length
    ? t('shared_trigger_comments', 'Gatilho: comentário') +
      ' · ' +
      channels
        .map((c) => (c.platform === 'facebook' ? 'Facebook' : 'Instagram'))
        .join(' / ')
    : triggerType === 'story_reply'
    ? t('trigger_node_label_story', 'Gatilho: Resposta ao story')
    : t('trigger_node_label', 'Gatilho: Comentario no Instagram');
  const description = messenger
    ? t('messenger_step_when')
    : triggerType === 'story_reply'
    ? t(
        'trigger_node_description_story',
        'Quando alguem responder ou reagir ao seu story'
      )
    : t('trigger_node_description', 'Quando alguem comentar em uma postagem');

  const modeLabel = messenger
    ? `${t('messenger_priority')}: ${config.priority}`
    : channels?.length
    ? channels
        .map(
          (channel) =>
            `${channel.name}: ${
              channel.postMode === 'specific'
                ? t(
                    'shared_selected_count',
                    '{{count}} publicações selecionadas',
                    { count: channel.postIds.length }
                  )
                : channel.postMode === 'scheduled' ? t('scheduled_selected_post') : channel.postMode === 'next_publication'
                ? t('shared_next', 'Próxima publicação')
                : t('shared_all', 'Todas as publicações')
            }`
        )
        .join(' · ')
    : (() => {
        if (mode === 'scheduled') return t('scheduled_selected_post');
        if (mode === 'next_publication') {
          return triggerType === 'story_reply'
            ? t('summary_next_story', 'Aguardando proximo story')
            : t('summary_next_publication', 'Aguardando proxima publicacao');
        }
        if (mode === 'specific') {
          if (triggerType === 'story_reply') {
            return t(
              'summary_specific_stories',
              '{count} story(ies) especifico(s)'
            ).replace('{count}', String(storyCount));
          }
          return t(
            'trigger_posts_selected',
            '{count} post(s) selected'
          ).replace('{count}', String(postCount));
        }
        return triggerType === 'story_reply'
          ? t('summary_all_stories', 'Qualquer story')
          : t('trigger_posts_all', 'Todos os posts');
      })();

  return (
    <div
      className={`rounded-[8px] border-2 px-[16px] py-[12px] min-w-[200px] max-w-[320px] ${
        selected ? 'border-green-400' : 'border-green-600'
      }`}
      style={{ background: 'rgba(34, 197, 94, 0.15)' }}
    >
      <div className="flex items-center gap-[8px] mb-[4px]">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#22c55e"
          strokeWidth="2"
        >
          <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" />
        </svg>
        <span className="text-[13px] font-semibold text-textColor">
          {title}
        </span>
      </div>
      <p className="text-[12px] text-textColor opacity-70">{description}</p>
      <p className="text-[11px] mt-[4px] text-textColor opacity-80">
        {modeLabel}
      </p>
      {keywords.length > 0 && (
        <p className="text-[11px] mt-[2px] truncate max-w-[180px] text-textColor opacity-70">
          {t('trigger_keywords_label', 'Palavras-chave')}: {keywords.join(', ')}
        </p>
      )}
      {config.requireFollow && (
        <span className="inline-block mt-[6px] text-[10px] px-[6px] py-[2px] rounded-[10px] border border-yellow-500/40 bg-yellow-500/10 text-yellow-200">
          ⚠️ {t('trigger_node_follow_gate_badge', 'Pede para seguir')}
        </span>
      )}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-green-400"
      />
    </div>
  );
});

TriggerNode.displayName = 'TriggerNode';
