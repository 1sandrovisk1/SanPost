'use client';
import { useEffect, useRef, useState } from 'react';
import { sanitizePostContent } from '@gitroom/helpers/utils/sanitize.post.content';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
export type PreviewAnchor = {
  postId: string;
  anchorStart: number;
  anchorEnd: number;
  anchorQuote: string;
};

export function PreviewText({
  postId,
  content,
}: {
  postId: string;
  content: string;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<PreviewAnchor | null>(null);
  const [stale, setStale] = useState(false);
  const t = useT();
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<PreviewAnchor>).detail;
      if (detail.postId !== postId || !element.current) return;
      element.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.getSelection()?.removeAllRanges();
      const text = element.current.textContent || '';
      setStale(
        text.slice(detail.anchorStart, detail.anchorEnd) !== detail.anchorQuote
      );
      if (
        text.slice(detail.anchorStart, detail.anchorEnd) === detail.anchorQuote
      ) {
        const walker = document.createTreeWalker(
          element.current,
          NodeFilter.SHOW_TEXT
        );
        const range = document.createRange();
        let offset = 0,
          started = false,
          node: Node | null;
        while ((node = walker.nextNode())) {
          const end = offset + (node.textContent?.length || 0);
          if (!started && detail.anchorStart < end) {
            range.setStart(node, detail.anchorStart - offset);
            started = true;
          }
          if (started && detail.anchorEnd <= end) {
            range.setEnd(node, detail.anchorEnd - offset);
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range);
            break;
          }
          offset = end;
        }
      }
    };
    window.addEventListener('preview-comment-focus', listener);
    return () => window.removeEventListener('preview-comment-focus', listener);
  }, [postId]);
  useEffect(() => {
    setAnchor(null);
    setStale(false);
  }, [content]);
  const select = () => {
    setAnchor(null);
    const selection = window.getSelection();
    const root = element.current;
    if (!root || !selection?.rangeCount || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (
      !root.contains(range.startContainer) ||
      !root.contains(range.endContainer)
    )
      return;
    const before = range.cloneRange();
    before.selectNodeContents(root);
    before.setEnd(range.startContainer, range.startOffset);
    const start = before.toString().length;
    const quote = range.toString();
    if (!quote.trim() || quote.length > 500) return;
    setAnchor({
      postId,
      anchorStart: start,
      anchorEnd: start + quote.length,
      anchorQuote: quote,
    });
  };
  return (
    <div>
      <div
        ref={element}
        onMouseUp={select}
        onKeyUp={select}
        className="text-sm whitespace-pre-wrap preview"
        dangerouslySetInnerHTML={{ __html: sanitizePostContent(content) }}
      />
      {stale && (
        <p role="status" className="text-sm">
          {t(
            'preview_anchor_stale',
            'This text has changed since the comment was written.'
          )}
        </p>
      )}
      {anchor && (
        <button
          type="button"
          className="border border-tableBorder rounded p-2 text-sm"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent('preview-comment-anchor', { detail: anchor })
            );
            setAnchor(null);
          }}
        >
          {t('preview_comment_selection', 'Comment on selected text')}
        </button>
      )}
    </div>
  );
}
