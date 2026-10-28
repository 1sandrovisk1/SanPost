'use client';
import { useEffect, useRef, useState, type FC } from 'react';
import {
  buildPreviewJourney,
  type PreviewJourneyContent,
} from './shared-preview-journey';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
interface PhonePreviewProps {
  platform?: 'instagram' | 'facebook';
  postScope?: 'specific' | 'all' | 'next_publication' | 'scheduled';
  postIsReel?: boolean;
  variant?: 'comment' | 'story';
  singleReply?: boolean;
  triggerType?: 'comment_on_post' | 'messenger_message';
  triggerText?: string;
  journey?: Omit<PreviewJourneyContent, 'message' | 'buttonText' | 'buttonUrl'>;
  postThumb?: string;
  postSelected?: boolean;
  postMediaType?: string;
  postCaption?: string;
  replyMessage?: string;
  dmMessage?: string;
  dmButtonText?: string;
  dmButtonUrl?: string;
  storyThumb?: string;
  storyMode?: 'all' | 'specific' | 'next_publication';
  commenterName?: string;
  integrationPicture?: string;
  integrationName?: string;
  activeTab?: 'post' | 'comments' | 'dm' | 'story';
  onTabChange?: (tab: 'post' | 'comments' | 'dm' | 'story') => void;
}

type Tab = 'post' | 'comments' | 'dm' | 'story';
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, string> = {
    back: 'm15 5-7 7 7 7',
    post: 'M3 3h18v18H3zM3 15l5-5 5 5 3-3 5 5',
    comments: 'M21 11a9 9 0 0 1-9 9H4l-2 2 1-8a9 9 0 1 1 18-3Z',
    dm: 'm22 2-7 20-4-9L2 9 22 2Zm0 0L11 13',
    heart: 'M12 21S1 14 2 7c1-6 8-6 10-1 2-5 9-5 10 1 1 7-10 14-10 14Z',
    like: 'M8 10 12 2c3 0 2 5 2 6h6l2 2-3 11H8Zm0 0H2v11h6',
    share: 'm14 4 8 7-8 7v-5c-6 0-9 3-12 6 1-8 5-11 12-11V4Z',
    phone: 'M5 2 2 5c0 8 9 17 17 17l3-3-6-4-2 2-7-7 2-2-4-6Z',
    video: 'M2 5h14v14H2zM16 10l6-4v12l-6-4',
    image: 'M3 3h18v18H3zM3 15l5-5 5 5 3-3 5 5',
    camera: 'M2 6h5l2-3h6l2 3h5v15H2zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    plus: 'M12 3v18M3 12h18',
    smile: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM7 14q5 6 10 0M8 8h.1M16 8h.1',
    save: 'M5 3h14v19l-7-5-7 5V3Z',
    story: 'M12 2a10 10 0 1 1-7 3M3 2v5h5',
  };
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name] || paths.comments} />
    </svg>
  );
}
export const WizardPhonePreview: FC<PhonePreviewProps> = (props) => {
  const {
    platform = 'instagram',
    variant = 'comment',
    singleReply = false,
    triggerType,
    triggerText,
    journey,
    postThumb,
    postSelected = false,
    postScope = 'specific',
    postIsReel = false,
    postMediaType,
    postCaption,
    replyMessage,
    dmMessage,
    dmButtonText,
    dmButtonUrl,
    storyThumb,
    storyMode = 'all',
    commenterName = 'usuario',
    integrationPicture,
    integrationName,
    activeTab,
    onTabChange,
  } = props;
  const t = useT();
  const [internalTab, setInternalTab] = useState<Tab>(
    singleReply ? 'dm' : variant === 'story' ? 'story' : 'comments'
  );
  const tab = activeTab ?? internalTab;
  const setTab = (next: Tab) => {
    setInternalTab(next);
    onTabChange?.(next);
  };
  const facebook = platform === 'facebook',
    light = facebook && (tab === 'dm' || tab === 'comments');
  const name = integrationName || t('preview_account_name');
  const incoming = triggerText || t('preview_user_comment');
  const renderText = (text: string) =>
    interpolatePreview(text, commenterName, singleReply, incoming);
  const messages = buildPreviewJourney({
    message: dmMessage,
    buttonText: dmButtonText,
    buttonUrl: dmButtonUrl,
    ...journey,
  });
  const conversation = useRef<HTMLDivElement>(null),
    signature = JSON.stringify(messages);
  useEffect(() => {
    if (tab === 'dm' && conversation.current)
      conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [tab, signature]);
  const tabs: Array<{ key: Tab; label: string }> =
    triggerType === 'messenger_message'
      ? [{ key: 'dm', label: t('preview_tab_dm') }]
      : variant === 'story'
      ? [
          { key: 'story', label: t('preview_tab_story') },
          { key: 'dm', label: t('preview_tab_dm') },
        ]
      : [
          { key: 'post', label: t('preview_tab_post') },
          { key: 'comments', label: t('preview_tab_comments') },
          { key: 'dm', label: t('preview_tab_dm') },
        ];
  const avatar = (participant = false) => (
    <span
      className="shrink-0 overflow-hidden rounded-full flex items-center justify-center"
      style={{
        width: participant ? 25 : 30,
        height: participant ? 25 : 30,
        background: facebook ? '#9bd96b' : '#315e70',
        color: '#205400',
        fontSize: 16,
        fontWeight: 600,
      }}
    >
      <img
        src={
          participant
            ? '/icons/automation-participant.svg'
            : integrationPicture || '/icons/automation-participant.svg'
        }
        alt=""
        className="w-full h-full object-cover"
      />
    </span>
  );
  const scopeText =
    variant === 'story'
      ? t(
          storyMode === 'all'
            ? 'story_preview_all_hint'
            : storyMode === 'next_publication'
            ? 'story_preview_next_hint'
            : 'story_preview_specific_hint'
        )
      : postScope === 'all'
      ? t('automation_preview_all_posts')
      : postScope === 'next_publication'
      ? t('wizard_next_publication')
      : postSelected
      ? t('automation_preview_media_unavailable')
      : t('preview_no_post');
  const media = (compact = false) => (
    <PublicationMedia
      src={tab === 'story' ? storyThumb : postThumb}
      mediaType={postMediaType}
      compact={compact}
      fallback={scopeText}
    />
  );
  return (
    <div className="flex flex-col items-center gap-4 select-none">
      <div
        data-phone
        className="relative flex flex-col overflow-hidden rounded-[42px] border-[11px] border-[#191e26] shadow-xl"
        style={{
          width: 304,
          height: 620,
          background: light ? '#fff' : '#111',
          color: light ? '#151515' : '#fff',
        }}
      >
        <div className="h-11 shrink-0 flex items-center justify-between px-5 text-[11px] font-semibold">
          <span>9:41</span>
          <span
            className="absolute left-1/2 -translate-x-1/2 top-3 w-12 h-2 rounded-full"
            style={{ background: light ? '#ddd' : '#292929' }}
          />
          <span aria-hidden="true">
            <svg width="54" height="12" viewBox="0 0 54 12" fill="currentColor">
              <path d="M0 9h2v3H0zm4-3h2v6H4zm4-3h2v9H8zm4-3h2v12h-2z" />
              <path d="M18 3q7-6 14 0l-2 2q-5-4-10 0zm3 3q4-3 8 0l-4 5z" />
              <rect x="36" y="2" width="15" height="8" rx="2" />
              <path d="M52 4h2v4h-2z" />
            </svg>
          </span>
        </div>
        {tab === 'dm' ? (
          <>
            <div
              className="flex items-center gap-2 px-3 pb-3 border-b"
              style={{ borderColor: light ? '#eee' : '#292929' }}
            >
              <span style={{ color: facebook ? '#0866ff' : 'inherit' }}>
                <Icon name="back" />
              </span>
              {avatar()}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[12px] truncate">{name}</p>
                {facebook && (
                  <p className="text-[10px] text-[#777]">
                    {t('automation_preview_business_chat')}
                  </p>
                )}
              </div>
              <Icon name="phone" size={17} />
              <Icon name="video" size={19} />
            </div>
            <div
              ref={conversation}
              className="flex-1 min-h-0 overflow-auto p-3 space-y-3"
            >
              {messages.length ? (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={`flex items-end gap-1.5 ${
                      message.role === 'user' ? 'justify-end' : ''
                    }`}
                  >
                    {message.role === 'page' && avatar()}
                    <div
                      className="max-w-[218px] rounded-2xl px-3 py-2 text-[11px] whitespace-pre-wrap break-words"
                      style={{
                        background:
                          message.role === 'user'
                            ? facebook
                              ? '#0866ff'
                              : '#6945ed'
                            : facebook
                            ? '#f0f2f5'
                            : '#282828',
                        color: message.role === 'user' ? 'white' : 'inherit',
                      }}
                    >
                      {renderText(message.text)}
                      {message.button && (
                        <div
                          className="mt-2 rounded-lg px-3 py-2 text-center font-semibold"
                          style={{ background: facebook ? '#fff' : '#3a3a3a' }}
                        >
                          {message.button.text}
                          {message.button.kind === 'link' && (
                            <span className="ml-1">↗</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-[11px] opacity-50 mt-2">
                  {t('preview_message_placeholder')}
                </p>
              )}
            </div>
            <div
              className="shrink-0 flex items-center gap-3 px-3 py-3"
              style={{ color: facebook ? '#0866ff' : '#eee' }}
            >
              <Icon name="camera" />
              <Icon name="image" />
              <div
                className="flex-1 rounded-full py-2 px-3 text-[10px]"
                style={{
                  background: facebook ? '#f0f2f5' : '#262626',
                  color: '#888',
                }}
              >
                {t('preview_message_placeholder')}
              </div>
              <Icon name={facebook ? 'like' : 'plus'} />
            </div>
          </>
        ) : (
          <>
            <div
              className="relative flex-1 min-h-0 overflow-hidden"
              style={{ background: '#111', color: '#fff' }}
            >
              <div className="h-10 flex items-center px-3 gap-2">
                <Icon name="back" />
                <span className="flex-1 text-center font-semibold text-[12px]">
                  {t(
                    tab === 'story' ? 'preview_tab_story' : 'preview_tab_post'
                  )}
                </span>
                <span>•••</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 text-[11px]">
                {avatar()}
                <strong>{name}</strong>
                <span className="ml-auto">•••</span>
              </div>
              {media(tab === 'comments')}
              {tab === 'story' && (
                <div className="absolute bottom-4 inset-x-3 rounded-full border border-white/40 px-3 py-2 text-[11px]">
                  {t(
                    storyMode === 'all'
                      ? 'automation_preview_all_stories'
                      : storyMode === 'next_publication'
                      ? 'wizard_next_publication'
                      : 'preview_story_reply_placeholder'
                  )}
                </div>
              )}
              {tab === 'post' && (
                <div className="px-3 py-3 space-y-3 text-[11px]">
                  <div className="flex gap-4">
                    {facebook ? <Icon name="like" /> : <Icon name="heart" />}
                    <Icon name="comments" />
                    <Icon name={facebook ? 'share' : 'dm'} />
                    <span className="ml-auto">
                      <Icon name="save" />
                    </span>
                  </div>
                  <p className="line-clamp-5">
                    <strong>{name}</strong> {postCaption}
                  </p>
                </div>
              )}
              {tab === 'comments' && (
                <div
                  className="absolute bottom-0 inset-x-0 top-[155px] rounded-t-[24px] flex flex-col"
                  style={{
                    background: facebook ? '#fff' : '#252525',
                    color: facebook ? '#151515' : '#fff',
                  }}
                >
                  <div className="w-8 h-1 rounded-full mx-auto my-2 bg-[#999]" />
                  <div
                    className="px-4 pb-3 text-[12px] font-semibold border-b"
                    style={{ borderColor: facebook ? '#eee' : '#444' }}
                  >
                    {t(
                      facebook
                        ? 'automation_preview_relevant_comments'
                        : 'preview_tab_comments'
                    )}
                  </div>
                  <div className="flex-1 overflow-auto p-3 text-[11px] space-y-4">
                    <div className="flex gap-2">
                      {avatar(true)}
                      <div className="flex-1">
                        <strong>{commenterName}</strong>
                        <p className="mt-1">{incoming}</p>
                        <p className="mt-2 text-[9px] opacity-50">
                          {t('preview_reply_action')}
                        </p>
                        {replyMessage && (
                          <div className="flex gap-2 mt-4">
                            {avatar()}
                            <div>
                              <strong>{name}</strong>
                              <p className="mt-1 whitespace-pre-wrap">
                                {renderText(replyMessage)}
                              </p>
                              <p className="mt-2 text-[9px] opacity-50">
                                {t('preview_reply_action')}
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                      <span className="opacity-60">
                        <Icon name={facebook ? 'like' : 'heart'} size={15} />
                      </span>
                    </div>
                  </div>
                  {!facebook && (
                    <div className="px-3 pb-3 flex justify-between text-base">
                      <span>❤️</span>
                      <span>🙌</span>
                      <span>🔥</span>
                      <span>👏</span>
                      <span>😍</span>
                      <span>😂</span>
                    </div>
                  )}
                  <div
                    className="px-3 py-3 flex gap-2 items-center border-t"
                    style={{ borderColor: facebook ? '#eee' : '#444' }}
                  >
                    {avatar(true)}
                    <div
                      className="flex-1 rounded-full border px-3 py-2 text-[9px] opacity-50"
                      style={{ borderColor: facebook ? '#ddd' : '#666' }}
                    >
                      {t('preview_comment_placeholder')}
                    </div>
                    <Icon name="smile" size={19} />
                  </div>
                </div>
              )}
              {postIsReel && tab === 'post' && (
                <div className="absolute right-3 bottom-28 flex flex-col gap-5">
                  <Icon name="like" />
                  <Icon name="comments" />
                  <Icon name="share" />
                </div>
              )}
            </div>
          </>
        )}
      </div>
      <div
        className="flex gap-1 rounded-full bg-newTextColor/5 p-1"
        aria-label={t('shared_preview')}
      >
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-label={item.label}
            title={item.label}
            aria-pressed={item.key === tab}
            onClick={() => setTab(item.key)}
            className={`rounded-full px-4 py-2 transition-colors focus-visible:ring-2 focus-visible:ring-btnPrimary ${
              item.key === tab
                ? 'bg-newBgColorInner shadow-sm text-newTextColor'
                : 'text-newTextColor/50 hover:bg-boxHover'
            }`}
          >
            <Icon name={item.key} />
          </button>
        ))}
      </div>
    </div>
  );
};
function PublicationMedia({
  src,
  mediaType,
  compact,
  fallback,
}: {
  src?: string;
  mediaType?: string;
  compact: boolean;
  fallback: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const style = {
    width: '100%',
    height: compact ? 155 : 280,
    objectFit: 'cover' as const,
  };
  if (src && !failed)
    return mediaType === 'VIDEO' ? (
      <video
        src={`${src}#t=0.1`}
        muted
        playsInline
        preload="metadata"
        style={style}
        onError={() => setFailed(true)}
      />
    ) : (
      <img src={src} alt="" style={style} onError={() => setFailed(true)} />
    );
  return (
    <div
      className="flex items-center justify-center bg-[#1b1b1b] px-5 text-center text-[12px] text-[#aaa]"
      style={style}
    >
      {fallback}
    </div>
  );
}
function interpolatePreview(
  template: string,
  commenterName: string,
  shared = false,
  commentText = ''
): string {
  if (shared)
    return template.replace(
      /\{\{\s*(comment_name|comment_text|comment_id|media_id)\s*\}\}/g,
      (_, key: 'comment_name' | 'comment_text' | 'comment_id' | 'media_id') =>
        ({
          comment_name: commenterName,
          comment_text: commentText,
          comment_id: '12345',
          media_id: '67890',
        }[key])
    );
  return template
    .replace(/\{commenter_name\}/g, commenterName)
    .replace(/\{commenter_id\}/g, '12345')
    .replace(/\{comment_text\}/g, commentText)
    .replace(/\{media_id\}/g, '67890');
}
