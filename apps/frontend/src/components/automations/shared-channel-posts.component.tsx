'use client';
import {
  AutomationPublicationSelector,
  type PublicationPreview,
} from './shared-publication-selector.component';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import type { AutomationTriggerType } from '@gitroom/nestjs-libraries/database/prisma/flows-v2/flow-definition';
import { useEffect, useState } from 'react';
import { useCurrentProfile } from '@gitroom/frontend/hooks/use-current-profile.hook';
import { SharedFacebookPostLookup } from './shared-facebook-post-lookup.component';
import {
  useT,
  useTranslationSettings,
} from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import { useSharedFlowData } from './hooks/use-shared-flows';
import { connectionSettingsUrl } from './shared-flow-ui';
import { facebookSetupDateOptions } from '../settings/facebook-automation-dates';
import type {
  AutomationPostView,
  AutomationReadiness,
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
  return (
    <SharedChannelPostsContent
      key={`${profile?.id}:${props.channel.integrationId}:${
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
  const fetchApi = useFetch();
  const messenger = triggerType === 'messenger_message';
  const [activating, setActivating] = useState(false);
  const [activationError, setActivationError] = useState(false);
  const { resolvedLanguage } = useTranslationSettings();
  const [cursor, setCursor] = useState<string | null>(null);
  const [posts, setPosts] = useState<AutomationPostView[]>([]);
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
  const connection = useSharedFlowData<AutomationReadiness>(
    `/flows-v2/channels/${channel.integrationId}/readiness${
      messenger ? '?triggerType=messenger_message' : ''
    }`
  );
  const readiness = connection.data;
  const activate = async () => {
    setActivating(true);
    setActivationError(false);
    try {
      const response = await fetchApi(
        `/flows-v2/channels/${channel.integrationId}/activate-messenger`,
        { method: 'POST' }
      );
      if (!response.ok) throw new Error('ACTIVATION_FAILED');
      const next: AutomationReadiness = await response.json();
      await connection.mutate(next, false);
      setActivationError(!next.ready);
    } catch {
      setActivationError(true);
    } finally {
      setActivating(false);
    }
  };
  useEffect(() => {
    if (result.data?.posts)
      setPosts((old) => [
        ...new Map(
          [...old, ...result.data!.posts].map((p) => [p.id, p])
        ).values(),
      ]);
  }, [result.data]);
  const missing = channel.postIds.filter(
    (id) => !posts.some((p) => p.id === id)
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between items-start gap-2 text-xs">
        <span
          className={
            readiness?.ready ? 'text-green-600' : 'text-newTextColor/70'
          }
        >
          {connection.error
            ? t('shared_check_failed')
            : !readiness
            ? t('shared_checking')
            : readiness.ready
            ? t('shared_ready')
            : t('shared_connection_needed')}
        </span>
        <details className="max-w-md">
          <summary className="cursor-pointer text-newTextColor/60 hover:text-textColor">
            {t('shared_connection_details')}
          </summary>
          <div className="space-y-2 mt-2 text-newTextColor/70">
            {readiness?.checkedAt && (
              <p>
                {t(
                  'fb_auto_checked_at',
                  facebookSetupDateOptions(
                    readiness.checkedAt,
                    resolvedLanguage
                  )
                )}
              </p>
            )}
            {readiness?.noScheduledExpiry && (
              <p>{t('shared_token_no_expiry')}</p>
            )}
            {readiness?.tokenExpiresAt && (
              <p>
                {t('shared_token_expiry')}:{' '}
                {
                  facebookSetupDateOptions(
                    readiness.tokenExpiresAt,
                    resolvedLanguage
                  ).time
                }
              </p>
            )}
            {readiness?.dataAccessExpiresAt && (
              <p>
                {t('shared_data_expiry')}:{' '}
                {
                  facebookSetupDateOptions(
                    readiness.dataAccessExpiresAt,
                    resolvedLanguage
                  ).time
                }
              </p>
            )}
            <button
              type="button"
              className="underline"
              onClick={() => void connection.mutate()}
            >
              {t('shared_refresh_connection')}
            </button>
            <a
              className="block underline"
              href={connectionSettingsUrl(provider, channel.integrationId)}
              target="_blank"
              rel="noreferrer"
            >
              {t('shared_setup_new_tab')}
            </a>
          </div>
        </details>
      </div>
      {(connection.error || (readiness && !readiness.ready)) && (
        <a
          className="inline-block underline text-sm"
          href={connectionSettingsUrl(provider, channel.integrationId)}
          target="_blank"
          rel="noreferrer"
        >
          {t('shared_setup_new_tab')}
        </a>
      )}
      {messenger && readiness && !readiness.ready && (
        <div className="space-y-2 text-sm">
          <p>
            {t(
              readiness.reason === 'MESSENGER_APP_SUBSCRIPTION_REQUIRED'
                ? 'messenger_app_subscription_help'
                : 'messenger_receiving_help'
            )}
          </p>
          {readiness.reason === 'MESSENGER_PAGE_SUBSCRIPTION_REQUIRED' && (
            <Button
              secondary
              disabled={disabled || activating}
              onClick={activate}
            >
              {activating
                ? t('messenger_activating')
                : t('messenger_activate_receiving')}
            </Button>
          )}
          {activationError && (
            <p role="alert">{t('messenger_activation_failed')}</p>
          )}
        </div>
      )}
      {!messenger && (
        <>
          <AutomationPublicationSelector
            onPreviewChange={onPreviewChange}
            platform={provider === 'facebook' ? 'facebook' : 'instagram'}
            integrationId={channel.integrationId}
            mode={channel.postMode}
            postIds={channel.postIds}
            scheduledPostId={channel.scheduledPostId}
            posts={posts}
            disabled={disabled}
            loading={result.isLoading}
            error={!!result.error}
            onRetry={() => void result.mutate()}
            onLoadMore={
              result.data?.nextCursor
                ? () => setCursor(result.data!.nextCursor!)
                : undefined
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
          {provider === 'facebook' && channel.postMode === 'specific' && (
            <SharedFacebookPostLookup
              integrationId={channel.integrationId}
              selectedIds={channel.postIds}
              disabled={disabled}
              onAdd={(post) =>
                onChange({
                  ...channel,
                  postIds: [...new Set([...channel.postIds, post.id])],
                })
              }
            />
          )}
          {channel.postMode === 'specific' && channel.postIds.length > 0 && (
            <details className="text-xs text-newTextColor/60">
              <summary className="cursor-pointer">
                {t('shared_selected_count', { count: channel.postIds.length })}
              </summary>
              {missing.length > 0 && (
                <p className="mt-2">{t('shared_posts_not_loaded')}</p>
              )}
              <ul className="mt-2 break-all">
                {channel.postIds.map((id) => (
                  <li key={id} className="flex justify-between gap-2 py-1">
                    <span>{id}</span>
                    <button
                      type="button"
                      disabled={disabled}
                      className="underline"
                      aria-label={`${t('fb_post_remove')} ${id}`}
                      onClick={() =>
                        onChange({
                          ...channel,
                          postIds: channel.postIds.filter((p) => p !== id),
                        })
                      }
                    >
                      {t('remove')}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
