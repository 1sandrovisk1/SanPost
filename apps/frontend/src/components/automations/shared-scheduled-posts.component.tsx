'use client';
import { useEffect, useState } from 'react';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import type {
  ScheduledAutomationPostView,
  ScheduledAutomationPostsView,
} from '@gitroom/nestjs-libraries/dtos/flows/scheduled-post.dto';
import { useSharedFlowData } from './hooks/use-shared-flows';
export function ScheduledPostSelector({
  integrationId,
  value,
  onChange,
  disabled = false,
}: {
  integrationId: string;
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [cursor, setCursor] = useState<string | null>(null);
  const [posts, setPosts] = useState<ScheduledAutomationPostView[]>([]);
  const query = new URLSearchParams({
    ...(cursor ? { cursor } : {}),
    ...(value ? { selectedId: value } : {}),
  });
  const result = useSharedFlowData<ScheduledAutomationPostsView>(
    integrationId
      ? `/automation-scheduled-posts/${integrationId}?${query}`
      : null
  );
  useEffect(() => {
    setPosts([]);
    setCursor(null);
  }, [integrationId]);
  useEffect(() => {
    if (result.data?.posts)
      setPosts((old) => [
        ...new Map(
          [
            ...old,
            ...result.data!.posts,
            ...(result.data!.selected ? [result.data!.selected] : []),
          ].map((p) => [p.id, p])
        ).values(),
      ]);
  }, [result.data]);
  const selected = result.data?.selected || posts.find((p) => p.id === value);
  return (
    <div className="space-y-2 text-sm">
      <label className="block">
        <span className="block mb-2">{t('scheduled_select_post')}</span>
        <select
          className="w-full min-h-[42px] rounded-lg border border-newTableBorder bg-newBgColorInner p-3 text-sm text-textColor disabled:opacity-60"
          value={value}
          disabled={disabled || result.isLoading}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">{t('scheduled_select_placeholder')}</option>
          {value && !posts.some((p) => p.id === value) && (
            <option value={value}>{t('scheduled_selected_post')}</option>
          )}
          {posts.map((p) => (
            <option key={p.id} value={p.id}>
              {new Date(p.publishDate).toLocaleString()} ·{' '}
              {p.caption || t('scheduled_no_caption')}
            </option>
          ))}
        </select>
      </label>
      {result.isLoading && <p role="status">{t('shared_posts_loading')}</p>}
      {result.error && (
        <div role="alert">
          <p>{t('scheduled_load_error')}</p>
          <Button secondary onClick={() => void result.mutate()}>
            {t('fb_auto_retry')}
          </Button>
        </div>
      )}
      {selected && (
        <p role="status" className="text-newTextColor/70">
          {t(`scheduled_status_${selected.status}`)}
        </p>
      )}
      {value &&
        !result.isLoading &&
        !result.error &&
        result.data &&
        !selected && <p role="alert">{t('scheduled_status_unavailable')}</p>}
      {!value && result.data?.posts?.length === 0 && !result.error && (
        <p>{t('scheduled_empty')}</p>
      )}
      {result.data?.nextCursor && (
        <Button
          secondary
          disabled={result.isLoading}
          onClick={() => setCursor(result.data!.nextCursor)}
        >
          {t('load_more')}
        </Button>
      )}
      <p className="text-xs text-newTextColor/60">
        {t('scheduled_binding_hint')}
      </p>
    </div>
  );
}
