import { HttpException } from '@nestjs/common';
import { record } from './meta-automation-graph.client';
import type { AutomationPostView } from '../../dtos/flows/flow-v2.dto';

const numberId = /^[1-9]\d{0,31}$/;
const postId = /^[1-9]\d{0,31}(?:_[1-9]\d{0,31})?$/;
const facebookHosts = new Set([
  'facebook.com',
  'www.facebook.com',
  'm.facebook.com',
  'mbasic.facebook.com',
]);
const invalid = () => new HttpException('INVALID_POST_REFERENCE', 400);

/** Extracts an ID only. The supplied URL is never fetched or redirected. */
export function facebookPostReference(
  reference: string,
  pageId: string
): string {
  if (
    typeof reference !== 'string' ||
    reference.length > 2048 ||
    !numberId.test(pageId)
  )
    throw invalid();
  let candidate = reference.trim();
  if (!postId.test(candidate)) {
    if (
      /[\\\s]/.test(candidate) ||
      /\/(?:\.{1,2})(?:\/|$)/.test(candidate) ||
      /%2e/i.test(candidate)
    )
      throw invalid();
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      throw invalid();
    }
    if (
      url.protocol !== 'https:' ||
      !facebookHosts.has(url.hostname) ||
      url.username ||
      url.password ||
      url.port
    )
      throw invalid();
    const path =
      /^\/([A-Za-z0-9.]+)\/posts\/([1-9]\d{0,31}(?:_[1-9]\d{0,31})?)\/?$/.exec(
        url.pathname
      );
    const reel = /^\/reel\/([1-9]\d{0,31})\/?$/.exec(url.pathname);
    if (reel) {
      if (url.searchParams.has('id') || url.searchParams.has('story_fbid'))
        throw invalid();
      candidate = reel[1];
    } else if (path) {
      candidate = path[2];
      // A conflicting query owner must not override the path's Page.
      if (url.searchParams.has('id') || url.searchParams.has('story_fbid'))
        throw invalid();
    } else if (/^\/(?:permalink|story)\.php$/.test(url.pathname)) {
      if (
        url.searchParams.getAll('id').length !== 1 ||
        url.searchParams.getAll('story_fbid').length !== 1
      )
        throw invalid();
      const owner = url.searchParams.get('id')!;
      candidate = url.searchParams.get('story_fbid')!;
      if (!numberId.test(owner)) throw invalid();
    } else throw invalid();
  }
  if (!postId.test(candidate)) throw invalid();
  const [prefix] = candidate.split('_');
  // Permalinks may use a Page profile alias different from the Graph Page ID.
  // Only the post ID is extracted; the caller queries the selected Page's ID
  // and must verify the returned canonical id AND from.id before exposing data.
  if (candidate.includes('_') && prefix !== pageId)
    throw new HttpException('POST_CHANNEL_MISMATCH', 412);
  return candidate.includes('_') ? candidate : `${pageId}_${candidate}`;
}

function safeUrl(value: unknown, image = false): string | undefined {
  if (typeof value !== 'string' || value.length > 4096) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return undefined;
    const allowed =
      facebookHosts.has(url.hostname) ||
      (image &&
        ['fbcdn.net', 'fbsbx.com'].some(
          (domain) =>
            url.hostname === domain || url.hostname.endsWith(`.${domain}`)
        ));
    if (allowed) return url.toString();
  } catch {
    /* Missing/invalid optional metadata does not prevent selection. */
  }
  return undefined;
}

/** Project bounded, display-only fields after the caller has proved ownership. */
export function facebookPostPreview(
  post: Record<string, unknown>,
  id: string
): AutomationPostView {
  return {
    id,
    ...(typeof post.is_published === 'boolean'
      ? { isPublished: post.is_published }
      : {}),
    caption:
      typeof post.message === 'string' ? post.message.slice(0, 5000) : '',
    permalink: safeUrl(post.permalink_url),
    thumbnailUrl: safeUrl(post.full_picture, true),
    timestamp:
      typeof post.created_time === 'string' &&
      post.created_time.length <= 64 &&
      Number.isFinite(Date.parse(post.created_time))
        ? post.created_time
        : undefined,
  };
}

/** A single video attachment (or strict Reel permalink) identifies the Video object. */
export function facebookPostVideoId(
  post: Record<string, unknown>
): string | undefined {
  const attachments = record(post.attachments).data;
  const videos = (Array.isArray(attachments) ? attachments : [])
    .map(record)
    .filter(
      (a) =>
        a.media_type === 'video' ||
        (typeof a.type === 'string' && a.type.startsWith('video_'))
    );
  if (videos.length === 1) {
    const id = record(videos[0].target).id;
    if (typeof id !== 'string' || !numberId.test(id))
      throw new HttpException('POST_VIDEO_RELATION_REQUIRED', 412);
    return id;
  }
  const permalink = safeUrl(post.permalink_url);
  return permalink
    ? /^\/reel\/([1-9]\d{0,31})\/?$/.exec(new URL(permalink).pathname)?.[1]
    : undefined;
}
