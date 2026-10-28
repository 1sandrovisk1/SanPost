import DOMPurify from 'isomorphic-dompurify';

const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'u',
  'a',
  'ul',
  'li',
  'h1',
  'h2',
  'h3',
  'span',
];

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'class',
  'data-mention-id',
  'data-mention-label',
];

export const sanitizePostContent = (value: unknown): string => {
  if (typeof value !== 'string' || !value) {
    return '';
  }

  // a block tag the editor doesn't know would be dropped with its text kept,
  // gluing its line to the next one
  const paragraphs = value.replace(
    /<(\/?)(div|section|article|blockquote|pre|h[4-6])\b[^<>]*>/gi,
    '<$1p>'
  );

  return DOMPurify.sanitize(paragraphs, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/|#)/i,
  });
};
