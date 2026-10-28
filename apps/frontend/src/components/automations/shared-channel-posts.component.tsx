'use client';
import {
  AutomationPublicationSelector,
  type PublicationPreview,
} from './shared-publication-selector.component';
import type { AutomationTriggerType } from '@gitroom/nestjs-libraries/database/prisma/flows-v2/flow-definition';
import { useEffect, useMemo, useState } from 'react';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { useSelectedFacebookPosts } from './shared-selected-facebook-posts';
import { useCurrentProfile } from '@gitroom/frontend/hooks/use-current-profile.hook';
import { SharedFacebookPostLookup } from './shared-facebook-post-lookup.component';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useSharedFlowData } from './hooks/use-shared-flows';
import type {
  AutomationPostView,
  FlowChannelDto,
} from '@gitroom/nestjs-libraries/dtos/flows/flow-v2.dto';

export const sharedInputClass =
  'w-full rounded-lg border border-newTableBorder bg-newBgColorInner px-[14px] py-[10px] text-[13px] text-textColor focus:outline-none focus:border-btnPrimary disabled:opacity-60';

type SharedChannelPostsProps = {
  channel: FlowChannelDto;
  triggerType?: AutomationTriggerType;
  provider: string;
  disabled: boolean;
  onChange: (channel: FlowChannelDto) => void;
  onPreviewChange?: (posts: PublicationPreview[]) => void;
};
export function SharedChannelPosts(props: SharedChannelPostsProps) {
  const { profile } = useCurrentProfile();
  const user = useUser();
  return (
    <SharedChannelPostsContent
      key={`${user?.id}:${profile?.id}:${props.channel.integrationId}:${
        props.triggerType || 'comment_on_post'
      }`}
      {...props}
    />
  );
}

function SharedChannelPostsContent({
  channel,
  triggerType = 'comment_on_post',
  provider,
  disabled,
  onChange,
  onPreviewChange,
}: SharedChannelPostsProps) {
  const t = useT();
  const messenger = triggerType === 'messenger_message';
  const [cursor, setCursor] = useState<string | null>(null);
  const [posts, setPosts] = useState<AutomationPostView[]>([]);
  const [recovered, setRecovered] = useState<PublicationPreview[]>([]);
  const [lookedUpIds, setLookedUpIds] = useState<string[]>([]);
  const result = useSharedFlowData<{
    posts: AutomationPostView[];
    nextCursor?: string;
  }>(
    !messenger && ['specific', 'scheduled'].includes(channel.postMode)
      ? `/flows-v2/channels/${channel.integrationId}/posts${
          cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''
        }`
      : null
  );
  useEffect(() => {
    if (result.data?.posts)
      setPosts((old) => [
        ...new Map(
          [...old, ...result.data!.posts].map((p) => [p.id, p])
        ).values(),
      ]);
  }, [result.data]);
  const missing = channel.postIds.filter(
    (id) => !posts.some((p) => p.id === id) && !lookedUpIds.includes(id)
  );
  const selected = useSelectedFacebookPosts(
    provider === 'facebook' &&
      !messenger &&
      channel.postMode === 'specific' &&
      !result.isLoading
      ? channel.integrationId
      : null,
    missing
  );
  useEffect(() => {
    if (selected.posts.length)
      setRecovered((old) => [
        ...new Map(
          [
            ...old,
            ...selected.posts.map((post) => ({ ...post, locatedById: true })),
          ].map((post) => [post.id, post])
        ).values(),
      ]);
  }, [selected.posts]);
  const catalog = useMemo(
    () => [
      ...new Map(
        [
          ...recovered,
          ...selected.posts.map((post) => ({ ...post, locatedById: true })),
          ...posts,
        ].map((post) => [post.id, post])
      ).values(),
    ],
    [posts, recovered, selected.posts]
  );
  const unavailable = channel.postIds.filter(
    (id) => !catalog.some((p) => p.id === id)
  );
  return (
    <div className="space-y-4">
      {!messenger && (
        <>
          <AutomationPublicationSelector
            onPreviewChange={onPreviewChange}
            platform={provider === 'facebook' ? 'facebook' : 'instagram'}
            integrationId={channel.integrationId}
            mode={channel.postMode}
            postIds={channel.postIds}
            scheduledPostId={channel.scheduledPostId}
            posts={catalog}
            disabled={disabled}
            loading={result.isLoading}
            error={!!result.error}
            onRetry={() => void result.mutate()}
            onLoadMore={
              result.data?.nextCursor
                ? () => setCursor(result.data!.nextCursor!)
                : undefined
            }
            specificContent={
              <>
                {provider === 'facebook' && channel.postMode === 'specific' && (
                  <SharedFacebookPostLookup
                    integrationId={channel.integrationId}
                    selectedIds={channel.postIds}
                    selectedContent={
                      channel.postIds.length > 0 && (
                        <details className="text-xs text-newTextColor/60">
                          <summary className="cursor-pointer">
                            {t('shared_selected_count', {
                              count: channel.postIds.length,
                            })}
                          </summary>
                          {unavailable.length > 0 && (
                            <p>{t('shared_posts_not_loaded')}</p>
                          )}
                          <ul className="mt-2 break-all">
                            {channel.postIds.map((id) => (
                              <li
                                key={id}
                                className="flex justify-between gap-2 py-1"
                              >
                                <span>{id}</span>
                                <button
                                  type="button"
                                  disabled={disabled}
                                  className="underline"
                                  aria-label={`${t('fb_post_remove')} ${id}`}
                                  onClick={() =>
                                    onChange({
                                      ...channel,
                                      postIds: channel.postIds.filter(
                                        (p) => p !== id
                                      ),
                                    })
                                  }
                                >
                                  {t('remove')}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </details>
                      )
                    }
                    disabled={disabled}
                    onAdd={(post) => {
                      setRecovered((old) => [
                        ...new Map(
                          [...old, { ...post, locatedById: true }].map((p) => [
                            p.id,
                            p,
                          ])
                        ).values(),
                      ]);
                      setLookedUpIds((old) => [...new Set([...old, post.id])]);
                      onChange({
                        ...channel,
                        postIds: [...new Set([...channel.postIds, post.id])],
                      });
                    }}
                  />
                )}
                {provider === 'facebook' &&
                  (selected.error ||
                    selected.failedIds.length > 0 ||
                    selected.hasMore) && (
                    <div className="space-y-2 text-xs text-newTextColor/70">
                      <p>{t('fb_selected_posts_recovery_help')}</p>
                      {selected.hasMore && (
                        <button
                          type="button"
                          className="underline"
                          onClick={() => void selected.loadMore()}
                        >
                          {t('fb_selected_posts_load_more')}
                        </button>
                      )}
                      {(selected.error || selected.failedIds.length > 0) && (
                        <button
                          type="button"
                          className="underline"
                          onClick={() => void selected.retry()}
                        >
                          {t('fb_selected_posts_retry')}
                        </button>
                      )}
                    </div>
                  )}
              </>
            }
            onChange={(selection) =>
              onChange({
                ...channel,
                postMode: selection.mode,
                postIds: selection.postIds,
                scheduledPostId: selection.scheduledPostId,
              })
            }
          />
        </>
      )}
    </div>
  );
}
