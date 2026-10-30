'use client';
import { PostComment, withProvider } from '../high.order.provider';
import { Input } from '@gitroom/react/form/input';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { TumblrDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/tumblr.dto';
export function TumblrSettings() {
  const form = useSettings();
  const t = useT();
  return (
    <>
      <Input
        label={t('title', 'Title')}
        aria-label={t('title', 'Title')}
        {...form.register('title')}
      />
      <Input
        label={t('tumblr_link_url', 'Link URL')}
        aria-label={t('tumblr_link_url', 'Link URL')}
        {...form.register('link')}
      />
      <Input
        label={t('tumblr_source_url', 'Source URL')}
        aria-label={t('tumblr_source_url', 'Source URL')}
        {...form.register('sourceUrl')}
      />
      <Input
        label={t('tumblr_tags', 'Tags (comma separated)')}
        aria-label={t('tumblr_tags', 'Tags (comma separated)')}
        {...form.register('tags')}
      />
    </>
  );
}
export default withProvider<TumblrDto>({
  comments: false,
  postComment: PostComment.POST,
  minimumCharacters: [],
  SettingsComponent: TumblrSettings,
  dto: TumblrDto,
  maximumCharacters: 32768,
  checkValidity: async (posts = [], _settings, _extra, t) => {
    if (posts.length > 1)
      return (
        t?.(
          'tumblr_single_post',
          'Tumblr supports one post, without comment blocks. Remove the extra blocks for this channel.'
        ) ||
        'Tumblr supports one post, without comment blocks. Remove the extra blocks for this channel.'
      );
    const [media = []] = posts;
    const videos = media.filter((m) => /\.mp4(?:$|[?#])/i.test(m.path)).length;
    if (videos > 1 || media.length - videos > 30)
      return (
        t?.(
          'tumblr_media_limit',
          'Tumblr supports up to 30 images and one video per post.'
        ) || 'Tumblr supports up to 30 images and one video per post.'
      );
    return true;
  },
});
