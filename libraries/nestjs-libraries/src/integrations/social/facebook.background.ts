import type { FacebookDto } from '../../dtos/posts/providers-settings/facebook.dto';
export function facebookBackgroundPreset(post: {
  message?: string;
  media?: unknown[];
  settings?: Partial<FacebookDto>;
}): string | undefined {
  const id = post.settings?.text_format_preset_id;
  if (
    !id ||
    post.settings?.post_type === 'story' ||
    post.settings?.url ||
    post.media?.length ||
    !post.message?.trim() ||
    post.message.length > 130 ||
    /(?:https?:\/\/|www\.|\b[a-z0-9.-]+\.[a-z]{2,}\b)/i.test(post.message)
  )
    return undefined;
  return id;
}
