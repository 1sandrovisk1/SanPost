'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { Button } from '@gitroom/react/form/button';
import SafeImage from '@gitroom/react/helpers/safe.image';
import type {
  AutomationPostView,
  ResolveAutomationPostView,
} from '@gitroom/nestjs-libraries/dtos/flows/flow-v2.dto';

const feedback: Record<string, string> = {
  INVALID_POST_REFERENCE: 'fb_post_error_reference',
  POST_CHANNEL_MISMATCH: 'fb_post_error_owner',
  POST_LOOKUP_ACCESS_REQUIRED: 'fb_post_error_access',
  POST_LOOKUP_RETRY: 'fb_post_error_retry',
  POST_LOOKUP_RATE_LIMITED: 'fb_post_error_rate',
  AUTHORIZATION_REQUIRED: 'fb_post_error_access',
};

/** Mounted only for the selected Facebook Page's specific-post trigger. */
export function SharedFacebookPostLookup({
  integrationId,
  selectedIds,
  disabled,
  onAdd,
}: {
  integrationId: string;
  selectedIds: string[];
  disabled: boolean;
  onAdd: (post: AutomationPostView) => void;
}) {
  const t = useT();
  const fetchApi = useFetch();
  const inputId = useId();
  const [reference, setReference] = useState('');
  const [post, setPost] = useState<AutomationPostView>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const pending = useRef<AbortController | undefined>(undefined);
  useEffect(
    () => () => {
      pending.current?.abort();
      pending.current = undefined;
    },
    []
  );
  const find = async () => {
    if (disabled || !reference.trim() || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    setBusy(true);
    setError(undefined);
    setPost(undefined);
    try {
      const response = await fetchApi(
        `/flows-v2/channels/${integrationId}/resolve-post`,
        {
          method: 'POST',
          body: JSON.stringify({ reference: reference.trim() }),
          signal: controller.signal,
        }
      );
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        setError(
          feedback[typeof data.message === 'string' ? data.message : ''] ||
            'fb_post_error_unavailable'
        );
        return;
      }
      const result = data as ResolveAutomationPostView;
      if (!result.post || !/^\d+_\d+$/.test(result.post.id))
        throw new Error('INVALID_RESULT');
      setPost(result.post);
    } catch {
      // No raw Meta message or credential-bearing error is rendered.
      if (pending.current === controller) setError('fb_post_error_retry');
    } finally {
      clearTimeout(timeout);
      if (pending.current === controller) {
        pending.current = undefined;
        setBusy(false);
      }
    }
  };
  const selected = !!post && selectedIds.includes(post.id);
  return (
    <details className="rounded-lg border border-newTableBorder bg-newBgColorInner p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        {t('fb_post_lookup_title')}
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-xs text-newTextColor/70">
          {t('fb_post_lookup_hint')}
        </p>
        <label className="block text-sm" htmlFor={inputId}>
          {t('fb_post_reference')}
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            id={inputId}
            value={reference}
            maxLength={2048}
            disabled={disabled || busy}
            className="min-w-0 flex-1 rounded-lg border border-newTableBorder bg-newBgColorInner px-3 py-2 text-sm text-textColor focus:outline-none focus:border-btnPrimary disabled:opacity-60"
            onChange={(e) => {
              setReference(e.target.value);
              setPost(undefined);
              setError(undefined);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void find();
              }
            }}
          />
          <Button
            secondary
            disabled={disabled || !reference.trim()}
            loading={busy}
            loadingLabel={t('fb_post_finding')}
            onClick={find}
          >
            {t('fb_post_find')}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {t(error)}
          </p>
        )}
        {post && (
          <div className="rounded-lg border border-newTableBorder p-3 space-y-3">
            <p
              role="status"
              className="text-xs text-green-700 dark:text-green-400"
            >
              {t('fb_post_lookup_confirmed')}
            </p>
            <div className="flex gap-3 items-start">
              {post.thumbnailUrl && (
                <SafeImage
                  src={post.thumbnailUrl}
                  alt=""
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded object-cover"
                />
              )}
              <div className="min-w-0 space-y-1">
                <p className="text-sm line-clamp-3">
                  {post.caption || t('shared_post_no_caption')}
                </p>
                <p className="text-xs text-newTextColor/60 break-all">
                  {post.id}
                </p>
                {post.permalink && (
                  <a
                    href={post.permalink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline"
                  >
                    {t('shared_open_post')}
                  </a>
                )}
              </div>
            </div>
            <Button
              secondary
              disabled={disabled || selected || selectedIds.length >= 100}
              onClick={() => {
                if (!disabled && !selected && selectedIds.length < 100)
                  onAdd(post);
              }}
            >
              {t(selected ? 'fb_post_added' : 'fb_post_add')}
            </Button>
          </div>
        )}
        <details className="text-xs text-newTextColor/70">
          <summary className="cursor-pointer underline">
            {t('fb_post_help_title')}
          </summary>
          <p className="mt-2">{t('fb_post_lookup_help')}</p>
          <p className="mt-2">{t('fb_post_lookup_formats')}</p>
        </details>
      </div>
    </details>
  );
}
