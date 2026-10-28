'use client';
import { useEffect, useMemo, useRef } from 'react';
import useSWR from 'swr';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useCurrentProfile } from '@gitroom/frontend/hooks/use-current-profile.hook';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import type { AutomationPostView } from '@gitroom/nestjs-libraries/dtos/flows/flow-v2.dto';

const batchSize = 5;
type SelectedPosts = {
  posts: AutomationPostView[];
  failedIds: string[];
  processed: number;
};
const empty: SelectedPosts = { posts: [], failedIds: [], processed: 0 };

/** Display-only recovery. It must never rewrite the automation's persisted targets. */
export function useSelectedFacebookPosts(
  integrationId: string | null,
  references: string[]
) {
  const fetchApi = useFetch();
  const { profile } = useCurrentProfile();
  const user = useUser();
  const ids = [...new Set(references)].sort().slice(0, 100);
  const identity = JSON.stringify([user?.id, profile?.id, integrationId, ids]);
  const controllers = useMemo(() => new Set<AbortController>(), [identity]);
  useEffect(() => {
    const active = controllers;
    return () => {
      for (const controller of active) controller.abort();
      active.clear();
    };
  }, [controllers]);
  const loadBatch = async (batch: string[]) => {
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = setTimeout(() => controller.abort(), 30000);
    const posts: AutomationPostView[] = [];
    const failedIds: string[] = [];
    let index = 0;
    const worker = async () => {
      while (index < batch.length && !controller.signal.aborted) {
        const reference = batch[index++];
        try {
          const response = await fetchApi(
            `/flows-v2/channels/${integrationId}/resolve-post`,
            {
              method: 'POST',
              cache: 'no-store',
              signal: controller.signal,
              body: JSON.stringify({ reference }),
            }
          );
          if (!response.ok) throw new Error('SELECTED_POST_UNAVAILABLE');
          const result = await response.json();
          if (controller.signal.aborted) break;
          if (
            result?.post?.id !== reference ||
            typeof result.post.caption !== 'string'
          )
            throw new Error('SELECTED_POST_MISMATCH');
          posts.push(result.post);
        } catch {
          failedIds.push(reference);
        }
      }
    };
    try {
      await Promise.all([worker(), worker()]);
      if (controller.signal.aborted) throw new Error('SELECTED_POST_ABORTED');
      return { posts, failedIds };
    } finally {
      clearTimeout(timeout);
      controllers.delete(controller);
    }
  };
  const result = useSWR<SelectedPosts>(
    user?.id && profile?.id && integrationId && ids.length
      ? ['selected-facebook-posts', identity]
      : null,
    async () => ({
      ...(await loadBatch(ids.slice(0, batchSize))),
      processed: Math.min(ids.length, batchSize),
    }),
    {
      keepPreviousData: false,
      shouldRetryOnError: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  );
  const data = result.data || empty;
  const busy = useRef(false);
  const update = async (retry: boolean) => {
    if (busy.current || !result.data) return;
    busy.current = true;
    try {
      await result.mutate(
        async (current) => {
          if (!current) return empty;
          const batch = retry
            ? current.failedIds.slice(0, batchSize)
            : ids.slice(current.processed, current.processed + batchSize);
          const next = await loadBatch(batch);
          return {
            posts: [
              ...new Map(
                [...current.posts, ...next.posts].map((p) => [p.id, p])
              ).values(),
            ],
            failedIds: [
              ...current.failedIds.filter((id) => !batch.includes(id)),
              ...next.failedIds,
            ],
            processed: retry
              ? current.processed
              : current.processed + batch.length,
          };
        },
        { revalidate: false, throwOnError: false }
      );
    } finally {
      busy.current = false;
    }
  };
  return {
    posts: data.posts,
    failedIds: data.failedIds,
    isLoading: result.isLoading,
    error: result.error,
    hasMore: !!result.data && data.processed < ids.length,
    loadMore: () => update(false),
    retry: () => (result.error ? result.mutate() : update(true)),
  };
}
