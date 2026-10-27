export type AutomationPostMode =
  | 'specific'
  | 'all'
  | 'next_publication'
  | 'scheduled';
export interface ScheduledAutomationPostView {
  id: string;
  caption: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  mediaType?: string;
  publishedPostIds?: string[];
  publishDate: string;
  state: string;
  status: 'waiting' | 'published' | 'failed' | 'cancelled' | 'unavailable';
}
export interface ScheduledAutomationPostsView {
  posts: ScheduledAutomationPostView[];
  selected?: ScheduledAutomationPostView;
  nextCursor: string | null;
}

export interface DeferredNextCandidate {
  id: string;
  revision: number;
  updatedAt: string;
  executionVersion: number;
}
