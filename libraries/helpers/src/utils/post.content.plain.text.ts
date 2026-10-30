import { parseFragment } from 'parse5';
import { sanitizePostContent } from '@gitroom/helpers/utils/sanitize.post.content';

type TextTreeNode = {
  nodeName: string;
  value?: string;
  childNodes?: TextTreeNode[];
};

// The plain text a reviewer sees for a post item: the text nodes of the
// sanitised HTML, in order, entities decoded. This is what the anchor offsets
// of a preview comment index into, on the frontend (element.textContent) and
// on the backend (upstream #2079). Kept out of sanitize.post.content so the
// frontend bundles that sanitize do not pull parse5.
export const postContentPlainText = (value: unknown): string => {
  const walk = (nodes: TextTreeNode[]): string =>
    nodes
      .map((node) =>
        node.nodeName === '#text'
          ? node.value || ''
          : walk(node.childNodes || [])
      )
      .join('');

  return walk(
    parseFragment(sanitizePostContent(value))
      .childNodes as unknown as TextTreeNode[]
  );
};
