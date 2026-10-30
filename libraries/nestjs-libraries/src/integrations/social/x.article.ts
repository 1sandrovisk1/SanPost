import { parseFragment } from 'parse5';
import { countPostContent } from '@gitroom/helpers/utils/count.length';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
import { normalizeOwnMediaUrl } from '@gitroom/helpers/utils/inline.images';

export const X_ARTICLE_MAX_LENGTH = 100000;
export function xMaximumLength(premium: unknown, settings?: any) {
  if (settings?.post_type === 'article') return X_ARTICLE_MAX_LENGTH;
  const verified = Array.isArray(premium)
    ? premium.some((p) => p?.title === 'Verified' && p.value === true)
    : premium === true;
  return verified ? 4000 : 200;
}
function imageUrlsInNode(node: any): string[] {
  if (node.nodeName === 'img') {
    const url = normalizeOwnMediaUrl(
      (node.attrs || []).find((a: any) => a.name === 'src')?.value
    );
    return url ? [url] : [];
  }
  return (node.childNodes || []).flatMap(imageUrlsInNode);
}
export const articleImageUrls = (html: string) => [
  ...new Set(imageUrlsInNode(parseFragment(html))),
];
export function xArticleError(
  settings: any,
  posts: Array<{ path: string }[]> = [],
  contents: string[] = [],
  native = true,
  premium: unknown = false
): string | undefined {
  if (settings?.post_type !== 'article') return;
  if (!native) return 'Artigos exigem uma conexão nativa do X.';
  if (contents.slice(1).some((html) => articleImageUrls(html).length))
    return 'Use anexos para imagens nas respostas do artigo, sem imagens inline.';
  if (posts.slice(1).some((p) => p.length > 4))
    return 'Uma resposta do artigo aceita até quatro imagens.';
  if (
    typeof settings.article_title !== 'string' ||
    !settings.article_title.trim() ||
    settings.article_title.length > 1000
  )
    return 'Informe um título de artigo com até 1.000 caracteres.';
  if (!['draft', 'published'].includes(settings.article_status))
    return 'Selecione rascunho no X ou publicação do artigo.';
  if (
    settings.article_status === 'draft' &&
    Math.max(posts.length, contents.length) > 1
  )
    return 'Um rascunho de artigo no X não pode ter respostas. Remova os blocos extras ou publique o artigo.';
  if (
    posts
      .flat()
      .some((m) => !/\.(png|jpe?g|gif|webp)(?:$|[?#])/i.test(m.path || ''))
  )
    return 'Artigos do X aceitam somente imagens.';
  if (
    settings.article_cover?.path &&
    !/\.(png|jpe?g|gif|webp)(?:$|[?#])/i.test(settings.article_cover.path)
  )
    return 'A capa do artigo precisa ser uma imagem.';
  for (const [index, html] of contents.entries()) {
    if (html.length > 500000)
      return 'O conteúdo do artigo excede o limite permitido.';
    const limit = xMaximumLength(premium, index === 0 ? settings : undefined);
    if (countPostContent('x', html, settings, index) > limit)
      return index === 0
        ? 'O artigo excede 100.000 caracteres.'
        : 'Uma resposta do artigo excede o limite de texto do X.';
  }
}

export function articleContentState(
  html: string,
  embeddedMediaIds: string[] = [],
  inlineMediaIds: Record<string, string> = {}
) {
  const blocks: any[] = [];
  const entities: any[] = [];

  const walkInline = (
    node: any,
    ctx: { text: string; styles: any[]; entityRanges: any[] }
  ) => {
    for (const child of node.childNodes || []) {
      if (child.nodeName === '#text') {
        ctx.text += child.value || '';
        continue;
      }

      const offset = ctx.text.length;
      walkInline(child, ctx);
      const length = ctx.text.length - offset;
      if (!length) {
        continue;
      }

      if (child.nodeName === 'strong' || child.nodeName === 'u') {
        ctx.styles.push({
          offset,
          length,
          style: child.nodeName === 'u' ? 'underline' : 'bold',
        });
      }

      if (child.nodeName === 'a') {
        const url = (child.attrs || []).find(
          (a: any) => a.name === 'href'
        )?.value;
        if (url && /^https?:\/\//i.test(url)) {
          const key = entities.length;
          entities.push({
            key: String(key),
            value: {
              type: 'link',
              mutability: 'mutable',
              data: { url },
            },
          });
          ctx.entityRanges.push({ offset, length, key });
        }
      }
    }
  };

  const makeBlock = (
    text: string,
    type: string,
    styles: any[] = [],
    entityRanges: any[] = []
  ) => ({
    key: `b${blocks.length}`,
    text,
    type,
    ...(styles.length ? { inline_style_ranges: styles } : {}),
    ...(entityRanges.length ? { entity_ranges: entityRanges } : {}),
  });

  const pushBlock = (node: any, type: string) => {
    const ctx = { text: '', styles: [] as any[], entityRanges: [] as any[] };
    walkInline(node, ctx);
    if (ctx.text.trim()) {
      blocks.push(makeBlock(ctx.text, type, ctx.styles, ctx.entityRanges));
    }

    // pictures inside the node (a list item can hold one) follow its text
    for (const src of imageUrlsInNode(node)) {
      if (inlineMediaIds[src]) {
        pushImage(inlineMediaIds[src]);
      }
    }
  };

  const pushImage = (mediaId: string) => {
    const key = entities.length;
    entities.push({
      key: String(key),
      value: {
        type: 'image',
        mutability: 'immutable',
        data: {
          media_items: [
            // Must match the category the media was uploaded with -
            // lowercase, like the upload endpoint (the uppercase
            // TWEET_IMAGE in the docs example is wrong).
            { media_category: 'tweet_image', media_id: mediaId },
          ],
        },
      },
    });
    blocks.push(makeBlock(' ', 'atomic', [], [{ offset: 0, length: 1, key }]));
  };

  const fragment = parseFragment(html) as any;
  for (const node of fragment.childNodes || []) {
    switch (node.nodeName) {
      case 'h1':
        pushBlock(node, 'header-one');
        break;
      case 'h2':
        pushBlock(node, 'header-two');
        break;
      case 'h3':
        // header-three is documented as valid but X's draft endpoint 503s on
        // it (https://devcommunity.x.com/t/-/271312), downgrade to header-two
        // until X fixes their side.
        pushBlock(node, 'header-two');
        break;
      case 'ul':
      case 'ol':
        for (const li of (node.childNodes || []).filter(
          (n: any) => n.nodeName === 'li'
        )) {
          pushBlock(
            li,
            node.nodeName === 'ol' ? 'ordered-list-item' : 'unordered-list-item'
          );
        }
        break;
      case '#text':
        if ((node.value || '').trim()) {
          blocks.push(makeBlock(node.value, 'unstyled'));
        }
        break;
      default:
        pushBlock(node, 'unstyled');
        break;
    }
  }

  // The API requires at least one block.
  if (!blocks.length) {
    blocks.push(makeBlock(stripHtmlValidation('none', html), 'unstyled'));
  }

  for (const mediaId of embeddedMediaIds) {
    pushImage(mediaId);
  }

  return { blocks, entities };
}
