'use client';

import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { ThreadFinisher } from '@gitroom/frontend/components/new-launch/finisher/thread.finisher';
import { Select } from '@gitroom/react/form/select';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { XDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/x.dto';
import { Input } from '@gitroom/react/form/input';
import { useIntegration } from '@gitroom/frontend/components/launches/helpers/use.integration';
import { MediaComponent } from '@gitroom/frontend/components/media/media.component';
import { xArticleError } from '@gitroom/nestjs-libraries/integrations/social/x.article';
import { Checkbox } from '@gitroom/react/form/checkbox';

const whoCanReply = [
  {
    labelKey: 'who_can_reply_everyone',
    labelFallback: 'Everyone',
    value: 'everyone',
  },
  {
    labelKey: 'who_can_reply_following',
    labelFallback: 'Accounts you follow',
    value: 'following',
  },
  {
    labelKey: 'who_can_reply_mentioned_users',
    labelFallback: 'Mentioned accounts',
    value: 'mentionedUsers',
  },
  {
    labelKey: 'who_can_reply_subscribers',
    labelFallback: 'Subscribers',
    value: 'subscribers',
  },
  {
    labelKey: 'who_can_reply_verified',
    labelFallback: 'Verified accounts',
    value: 'verified',
  },
];

export const XSettings = () => {
  const t = useT();
  const { register, watch, setValue } = useSettings();
  const { integration } = useIntegration();
  const native = integration?.identifier === 'x';
  const article = watch('post_type') === 'article';

  return (
    <>
      {native && (
        <Select
          label={t('x_post_format', 'Post format')}
          aria-label={t('x_post_format', 'Post format')}
          {...register('post_type')}
        >
          <option value="post">{t('x_format_post', 'Post')}</option>
          <option value="article">{t('x_format_article', 'Article')}</option>
        </Select>
      )}
      {article ? (
        <>
          {!native && (
            <p role="alert">
              {t(
                'x_article_native_only',
                'Articles require a native X connection.'
              )}{' '}
              <button
                type="button"
                className="underline"
                onClick={() =>
                  setValue('post_type', 'post', {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              >
                {t('x_use_regular_post', 'Use regular post')}
              </button>
            </p>
          )}
          <Input
            label={t('x_article_title', 'Article title')}
            aria-label={t('x_article_title', 'Article title')}
            maxLength={1000}
            {...register('article_title')}
          />
          <Select
            label={t('x_article_destination', 'Send article to X')}
            aria-label={t('x_article_destination', 'Send article to X')}
            {...register('article_status')}
          >
            <option value="draft">
              {t('x_article_save_draft', 'Save draft on X')}
            </option>
            <option value="published">
              {t('x_article_publish', 'Publish article')}
            </option>
          </Select>
          <MediaComponent
            type="image"
            label={t('x_article_cover', 'Article cover')}
            description={t(
              'x_article_cover_hint',
              'Optional cover, separate from images in the article body.'
            )}
            {...register('article_cover')}
          />
          <p className="mt-3 text-sm opacity-70">
            {t(
              'x_article_requirements',
              'Requires article access on the X account and app. Saving a draft sends it to X without publishing; draft articles cannot have replies.'
            )}
          </p>
        </>
      ) : (
        <>
          <Select
            label={t(
              'label_who_can_reply_to_this_post',
              'Who can reply to this post?'
            )}
            className="mb-5"
            hideErrors={true}
            {...register('who_can_reply_post', {
              value: 'everyone',
            })}
          >
            {whoCanReply.map((item) => (
              <option key={item.value} value={item.value}>
                {t(item.labelKey, item.labelFallback)}
              </option>
            ))}
          </Select>

          <Input
            label={t(
              'post_to_community_url_placeholder',
              'Post to a community, URL (Ex: https://x.com/i/communities/1493446837214187523)'
            )}
            {...register('community')}
          />

          <div className="mt-5 flex flex-col gap-[10px]">
            <Checkbox
              label={t('label_made_with_ai', 'Made with AI')}
              {...register('made_with_ai')}
            />
            <Checkbox
              label={t('label_paid_partnership', 'Paid partnership')}
              {...register('paid_partnership')}
            />
          </div>

          <ThreadFinisher />
        </>
      )}
    </>
  );
};

export default withProvider({
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: XSettings,
  defaults: {
    post_type: 'post',
    article_status: 'draft',
    who_can_reply_post: 'everyone',
  },
  inlineImages: (settings, identifier) =>
    identifier === 'x' && settings?.post_type === 'article',
  CustomPreviewComponent: undefined,
  dto: XDto,
  checkValidity: async (
    posts,
    settings,
    additionalSettings: any,
    t,
    identifier,
    contents
  ) => {
    if (settings?.post_type === 'article') {
      const error = xArticleError(
        settings,
        posts,
        contents,
        identifier === 'x',
        additionalSettings
      );
      return error
        ? t?.(
            'x_article_invalid',
            'Check the article title, images, text limits and remove replies from draft articles.'
          ) || error
        : true;
    }
    const premium =
      additionalSettings?.find((p: any) => p?.title === 'Verified')?.value ||
      false;
    if (posts?.some((p) => (p?.length ?? 0) > 4)) {
      return 'There can be maximum 4 pictures in a post.';
    }
    if (
      posts?.some(
        (p) =>
          p?.some((m) => (m?.path?.indexOf?.('mp4') ?? -1) > -1) &&
          (p?.length ?? 0) > 1
      )
    ) {
      return 'There can be maximum 1 video in a post.';
    }
    for (const load of posts?.flatMap((p) => p?.flatMap((a) => a?.path)) ??
      []) {
      if ((load?.indexOf?.('mp4') ?? -1) > -1) {
        const isValid = await checkVideoDuration(load, premium);
        if (!isValid) {
          return 'Video duration must be less than or equal to 140 seconds.';
        }
      }
    }
    return true;
  },
  maximumCharacters: (settings, values) => {
    if (values?.post_type === 'article') return 100000;
    if (settings?.[0]?.value) {
      return 4000;
    }
    return 280;
  },
});
const checkVideoDuration = async (
  url: string,
  isPremium = false
): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = url;
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      // Check if the duration is less than or equal to 140 seconds
      const duration = video.duration;
      if ((!isPremium && duration <= 140) || isPremium) {
        resolve(true); // Video duration is acceptable
      } else {
        resolve(false); // Video duration exceeds 140 seconds
      }
    };
    video.onerror = () => {
      reject(new Error('Failed to load video metadata.'));
    };
  });
};
