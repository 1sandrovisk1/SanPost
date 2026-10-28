import type {
  PublicationChoice,
  PublicationPreview,
} from './shared-publication-selector.component';
import type { ScheduledAutomationPostView } from '@gitroom/nestjs-libraries/dtos/flows/scheduled-post.dto';
/** Preserve selection order and unavailable IDs; previewing never changes the binding. */
export function selectedPublicationPreviews(
  choice: PublicationChoice,
  posts: PublicationPreview[],
  scheduled: ScheduledAutomationPostView[]
): PublicationPreview[] {
  if (choice.mode === 'specific')
    return choice.postIds.map((id) => posts.find((p) => p.id === id) || { id });
  if (choice.mode === 'scheduled' && choice.scheduledPostId) {
    const selected = scheduled.find((p) => p.id === choice.scheduledPostId);
    return [
      selected
        ? {
            id: selected.id,
            caption: selected.caption,
            thumbnailUrl: selected.thumbnailUrl,
            mediaUrl: selected.mediaUrl,
            mediaType: selected.mediaType,
            timestamp: selected.publishDate,
          }
        : { id: choice.scheduledPostId },
    ];
  }
  return [];
}

/** Visual deduplication only. Operational aliases still require server-side ownership checks. */
export function isPublishedScheduledPreview(
  scheduled: ScheduledAutomationPostView,
  remote: PublicationPreview,
  platform: 'instagram' | 'facebook'
): boolean {
  if (scheduled.publishedPostIds?.includes(remote.id)) return true;
  if (
    platform !== 'facebook' ||
    scheduled.status !== 'published' ||
    !remote.permalink
  )
    return false;
  try {
    const url = new URL(remote.permalink);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.port ||
      ![
        'facebook.com',
        'www.facebook.com',
        'm.facebook.com',
        'web.facebook.com',
      ].includes(url.hostname)
    )
      return false;
    const reel = /^\/reel\/(\d+)\/?$/.exec(url.pathname);
    return Boolean(reel && scheduled.publishedPostIds?.includes(reel[1]));
  } catch {
    return false;
  }
}
