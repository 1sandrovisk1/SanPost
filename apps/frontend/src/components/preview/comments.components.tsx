'use client';
import { useUser } from '@gitroom/frontend/components/layout/user.context';
import { Button } from '@gitroom/react/form/button';
import { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import useSWR from 'swr';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { PreviewRecaptcha } from './recaptcha';
import type { PreviewAnchor } from './preview.text';

type ReviewInfo =
  | { valid: false }
  | {
      valid: true;
      allowComment: boolean;
      allowApprove: boolean;
      expiresAt: string | null;
    };
type CommentItem = {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  kind: 'COMMENT' | 'APPROVAL' | 'CHANGE_REQUEST';
  createdAt: string;
  resolvedAt: string | null;
  author: 'member' | 'guest' | 'anonymous';
  name: string | null;
  memberIndex: number | null;
  anchorStart: number | null;
  anchorEnd: number | null;
  anchorQuote: string | null;
};
const fieldClass =
  'w-full p-2 rounded border border-tableBorder bg-newBgColorInner text-newTextColor text-sm';

export function CommentsComponents({
  postId,
  token,
  reviewInfo,
}: {
  postId: string;
  token?: string;
  reviewInfo?: ReviewInfo;
}) {
  const user = useUser();
  const fetchApi = useFetch();
  const t = useT();
  const guest = !!token && reviewInfo?.valid === true;
  const load = useCallback(async () => {
    if (user?.id && !guest) {
      const response = await fetchApi(`/posts/${postId}/comments`);
      if (response.ok)
        return {
          comments: (await response.json()) as CommentItem[],
          member: true,
          anonymousEnabled: false,
          recaptchaSiteKey: null as string | null,
        };
      if (response.status !== 403 && response.status !== 404)
        throw new Error('Failed to load comments');
    }
    const response = await fetchApi(`/public/posts/${postId}/comments`);
    if (!response.ok) throw new Error('Failed to load comments');
    return {
      ...((await response.json()) as {
        comments: CommentItem[];
        anonymousEnabled: boolean;
        recaptchaSiteKey: string | null;
      }),
      member: false,
    };
  }, [fetchApi, postId, user?.id, user?.orgId, user?.profileId, guest]);
  const {
    data,
    mutate,
    isLoading,
    error: loadError,
  } = useSWR(
    ['preview-comments', postId, user?.id, user?.orgId, user?.profileId, guest],
    load
  );
  const [content, setContent] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [captcha, setCaptcha] = useState('');
  const [reset, setReset] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(!!token && !guest);
  const [reply, setReply] = useState<CommentItem | null>(null);
  const [anchor, setAnchor] = useState<PreviewAnchor | null>(null);
  const member = data?.member === true;
  const viewer = member && user?.profileRole === 'VIEWER';
  const canModerate = member && !viewer;
  const canComment =
    member ||
    (guest && !linkInvalid && reviewInfo?.valid && reviewInfo.allowComment) ||
    (!token && data?.anonymousEnabled);
  const canApprove =
    viewer ||
    (guest && !linkInvalid && reviewInfo?.valid && reviewInfo.allowApprove);
  useEffect(() => {
    try {
      setName(localStorage.getItem('robo-multipost:guest-name') || '');
      setEmail(localStorage.getItem('robo-multipost:guest-email') || '');
    } catch {}
    const selected = (event: Event) => {
      setAnchor((event as CustomEvent<PreviewAnchor>).detail);
      setReply(null);
      document.getElementById('preview-comment-input')?.focus();
    };
    window.addEventListener('preview-comment-anchor', selected);
    return () => window.removeEventListener('preview-comment-anchor', selected);
  }, []);
  useEffect(() => {
    if (!guest || !token) return;
    let stopped = false;
    fetchApi(
      `/public/posts/${postId}/review?token=${encodeURIComponent(token)}`
    )
      .then(async (res) => {
        if (!res.ok || !(await res.json()).valid) {
          if (!stopped) setLinkInvalid(true);
        }
      })
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [fetchApi, postId, token, guest]);
  const failure = (status?: number) => {
    if (status === 404 && guest) setLinkInvalid(true);
    setError(
      status === 429
        ? t('too_many_requests', 'Too many requests. Try again later.')
        : t(
            'preview_comment_failed',
            'Could not save. Check the form and try again.'
          )
    );
  };
  const submit = async (kind: CommentItem['kind']) => {
    if (
      busy ||
      (kind === 'COMMENT' && (!content.trim() || !canComment)) ||
      (kind !== 'COMMENT' && !canApprove)
    )
      return;
    if (
      !member &&
      (!name.trim() || (guest && !email.trim()) || (!guest && !captcha))
    ) {
      setError(
        t(
          'preview_complete_form',
          'Fill in your details and complete the verification.'
        )
      );
      return;
    }
    setBusy(true);
    setError('');
    const placement =
      kind === 'COMMENT'
        ? reply
          ? { postId: reply.postId, parentId: reply.id }
          : anchor || {}
        : {};
    try {
      const endpoint = member
        ? `/posts/${postId}/comments`
        : guest
        ? `/public/posts/${postId}/review/${
            kind === 'COMMENT' ? 'comment' : 'approve'
          }`
        : `/public/posts/${postId}/comments`;
      const body = member
        ? { kind, comment: content.trim(), ...placement }
        : guest
        ? {
            token,
            guestName: name.trim(),
            guestEmail: email.trim(),
            content: content.trim(),
            note: content.trim(),
            decision: kind === 'APPROVAL' ? 'APPROVED' : 'CHANGE_REQUESTED',
            ...placement,
          }
        : {
            displayName: name.trim(),
            content: content.trim(),
            recaptchaToken: captcha,
            ...placement,
          };
      const response = await fetchApi(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        failure(response.status);
        return;
      }
      try {
        localStorage.setItem('robo-multipost:guest-name', name.trim());
        if (guest)
          localStorage.setItem('robo-multipost:guest-email', email.trim());
      } catch {}
      setContent('');
      setReply(null);
      setAnchor(null);
      await mutate();
    } catch {
      failure();
    } finally {
      setBusy(false);
      setCaptcha('');
      setReset((value) => value + 1);
    }
  };
  const moderate = async (comment: CommentItem, remove = false) => {
    if (busy || !canModerate) return;
    if (
      remove &&
      !window.confirm(
        t(
          'are_you_sure_delete_comment',
          'Are you sure you want to delete this comment?'
        )
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const response = await fetchApi(
        `/posts/${postId}/comments/${comment.id}${remove ? '' : '/resolve'}`,
        {
          method: remove ? 'DELETE' : 'PUT',
          ...(!remove
            ? { body: JSON.stringify({ resolved: !comment.resolvedAt }) }
            : {}),
        }
      );
      if (!response.ok) {
        failure(response.status);
        return;
      }
      await mutate();
    } catch {
      failure();
    } finally {
      setBusy(false);
    }
  };
  const renderComment = (comment: CommentItem, isReply = false) => (
    <article
      key={comment.id}
      className={`border-t border-tableBorder py-3 ${isReply ? 'ms-5' : ''}`}
    >
      <div className="flex flex-wrap gap-2 items-center text-sm">
        <strong>
          {comment.name || `${t('user', 'User')} ${comment.memberIndex || ''}`}
        </strong>
        <span className="text-xs">
          {comment.author === 'member'
            ? t('preview_team', 'Team')
            : comment.author === 'guest'
            ? t('guest', 'Guest')
            : t('preview_anonymous', 'Anonymous')}
        </span>
        {comment.kind !== 'COMMENT' && (
          <span>
            {comment.kind === 'APPROVAL'
              ? t('approved', 'Approved')
              : t('changes_requested', 'Changes requested')}
          </span>
        )}
        {comment.resolvedAt && <span>{t('preview_resolved', 'Resolved')}</span>}
      </div>
      {comment.anchorQuote && (
        <button
          type="button"
          className="text-start border-s-2 border-tableBorder ps-2 text-sm my-2"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent('preview-comment-focus', { detail: comment })
            )
          }
        >
          {comment.anchorQuote}
        </button>
      )}
      <p className="whitespace-pre-wrap text-sm">{comment.content}</p>
      <div className="flex flex-wrap gap-3 text-xs mt-2">
        {!isReply &&
          comment.kind === 'COMMENT' &&
          !comment.resolvedAt &&
          canComment && (
            <button
              disabled={busy}
              onClick={() => {
                setReply(comment);
                setAnchor(null);
                document.getElementById('preview-comment-input')?.focus();
              }}
            >
              {t('preview_reply', 'Reply')}
            </button>
          )}
        {!isReply && comment.kind === 'COMMENT' && canModerate && (
          <button disabled={busy} onClick={() => moderate(comment)}>
            {comment.resolvedAt
              ? t('preview_reopen', 'Reopen')
              : t('preview_resolve', 'Resolve')}
          </button>
        )}
        {canModerate && (
          <button disabled={busy} onClick={() => moderate(comment, true)}>
            {t('delete', 'Delete')}
          </button>
        )}
      </div>
    </article>
  );
  if (isLoading) return <p>{t('loading', 'Loading...')}</p>;
  if (loadError)
    return (
      <p role="alert">
        {t(
          'preview_load_failed',
          'Could not load comments. Reload the page to try again.'
        )}
      </p>
    );
  return (
    <section className="text-newTextColor">
      <h3 className="font-semibold mb-3">{t('comments', 'Comments')}</h3>
      {linkInvalid && (
        <p role="alert">
          {t(
            'review_link_invalid_body',
            'This review link is unavailable. Request a new link from the post owner.'
          )}
        </p>
      )}
      {(canComment || canApprove) && (
        <div className="space-y-3 mb-6">
          {!member && (
            <input
              aria-label={t('your_name', 'Your name')}
              className={fieldClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              placeholder={t('your_name', 'Your name')}
            />
          )}
          {guest && (
            <input
              type="email"
              aria-label={t('your_email', 'Your email')}
              className={fieldClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={254}
              placeholder={t('your_email', 'Your email')}
            />
          )}
          {(anchor || reply) && (
            <div className="border-s-2 border-tableBorder ps-2 text-sm">
              {anchor?.anchorQuote || reply?.content}
              <button
                type="button"
                className="ms-3"
                onClick={() => {
                  setAnchor(null);
                  setReply(null);
                }}
              >
                {t('cancel', 'Cancel')}
              </button>
            </div>
          )}
          <textarea
            id="preview-comment-input"
            aria-label={t('add_a_comment_dot', 'Add a comment...')}
            className={`${fieldClass} min-h-[90px]`}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={2000}
            placeholder={t('add_a_comment_dot', 'Add a comment...')}
          />
          {!member && !guest && data?.recaptchaSiteKey && (
            <PreviewRecaptcha
              siteKey={data.recaptchaSiteKey}
              reset={reset}
              onToken={setCaptcha}
            />
          )}
          <div className="flex flex-wrap gap-2">
            {canComment && (
              <Button
                disabled={busy || (!member && !guest && !captcha)}
                onClick={() => submit('COMMENT')}
              >
                {t('send_comment', 'Send comment')}
              </Button>
            )}
            {canApprove && (
              <>
                <Button disabled={busy} onClick={() => submit('APPROVAL')}>
                  {t('approve', 'Approve')}
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => submit('CHANGE_REQUEST')}
                >
                  {t('request_changes', 'Request changes')}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
      {!canComment && !canApprove && !token && !member && (
        <div>
          <p>
            {t(
              'preview_read_only',
              'Comments are read-only. Sign in or request a review link to comment.'
            )}
          </p>
          <button
            type="button"
            className="underline mt-2"
            onClick={() =>
              window.location.assign(
                `/auth?returnUrl=${encodeURIComponent(window.location.href)}`
              )
            }
          >
            {t('preview_sign_in', 'Sign in')}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-red-400">
          {error}
        </p>
      )}
      {(data?.comments || [])
        .filter((comment) => !comment.parentId)
        .map((comment) => (
          <div key={comment.id}>
            {renderComment(comment)}
            {(data?.comments || [])
              .filter((reply) => reply.parentId === comment.id)
              .map((reply) => renderComment(reply, true))}
          </div>
        ))}
    </section>
  );
}
