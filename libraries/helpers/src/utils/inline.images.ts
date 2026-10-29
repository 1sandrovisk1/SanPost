import { parseFragment, serialize } from 'parse5';
import { isAllowedUploadPath } from '@gitroom/helpers/utils/valid.url.path';

// Imagem inline no conteudo do post (upstream 2aae02fe). O upstream aceita
// qualquer src http(s); o fork so aceita a midia da propria instancia: o
// storage local servido em FRONTEND_URL/uploads/ e o bucket R2
// (CLOUDFLARE_BUCKET_URL). Uma URL de terceiro viraria pixel de rastreio no
// preview publico e nas paginas de revisao, e hotlink no artigo/e-mail.

export interface MediaOrigins {
  frontendUrl?: string;
  cloudflareUrl?: string;
}

export interface MediaPrefix {
  origin: string;
  pathname: string;
}

const toPrefix = (
  base: string | undefined,
  suffix: string
): MediaPrefix | null => {
  if (!base || !base.trim()) {
    return null;
  }

  try {
    const url = new URL(base.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return null;
    }

    return {
      origin: url.origin,
      pathname: url.pathname.replace(/\/+$/, '') + suffix,
    };
  } catch {
    return null;
  }
};

// Sem argumento le o ambiente do processo (backend, orchestrator e server
// components do Next). No navegador o ambiente nao existe: o editor passa os
// valores de useVariables(); sem nenhum, nenhuma imagem passa.
export const ownMediaPrefixes = (
  origins: MediaOrigins = {
    frontendUrl: process.env.FRONTEND_URL,
    cloudflareUrl: process.env.CLOUDFLARE_BUCKET_URL,
  }
): MediaPrefix[] =>
  [
    toPrefix(origins.frontendUrl, '/uploads/'),
    toPrefix(origins.cloudflareUrl, '/'),
  ].filter((prefix): prefix is MediaPrefix => !!prefix);

// Nomes gerados pelo storage (data/aleatorio.ext). `&`, `'`, `;` e afins nao
// sao codificados pelo parser de URL no path (um `&quot;` no path viraria
// aspas se algum consumidor decodificar entidades) e `%` fica de fora: o
// `new URL` resolve `%2e%2e` mas mantem `%2f`/`%5c`, que um proxy pode
// decodificar e tirar o caminho de /uploads/.
const SAFE_PATHNAME = /^[A-Za-z0-9\-._~/]+$/;

/**
 * Devolve a URL normalizada (origem + path, sem query/fragmento) quando `src`
 * aponta para a midia da instancia; `null` para qualquer outra coisa
 * (data:, javascript:, caminho relativo, outro host, credenciais na URL,
 * `..` saindo de /uploads/, caracteres fora do nome gerado pelo storage).
 */
export const normalizeOwnMediaUrl = (
  src: unknown,
  prefixes: MediaPrefix[] = ownMediaPrefixes()
): string | null => {
  if (typeof src !== 'string') {
    return null;
  }

  const value = src.trim();
  if (!/^https?:\/\//i.test(value)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.username || url.password || !SAFE_PATHNAME.test(url.pathname)) {
    return null;
  }

  // FRONTEND_URL com barra final gera `//uploads/...` no storage local
  const comparable = url.pathname.replace(/\/{2,}/g, '/');
  const allowed = prefixes.some(
    (prefix) =>
      url.origin === prefix.origin && comparable.startsWith(prefix.pathname)
  );
  const normalized = url.origin + url.pathname;

  return allowed && isAllowedUploadPath(normalized) ? normalized : null;
};

export const isOwnMediaUrl = (
  src: unknown,
  prefixes: MediaPrefix[] = ownMediaPrefixes()
) => !!normalizeOwnMediaUrl(src, prefixes);

type Node = {
  nodeName: string;
  attrs?: { name: string; value: string }[];
  childNodes?: Node[];
  content?: Node;
};

const attr = (node: Node, name: string) =>
  node.attrs?.find((a) => a.name === name)?.value;

const rewrite = (
  node: Node,
  prefixes: MediaPrefix[],
  plainAlt: boolean
): void => {
  if (node.content) {
    rewrite(node.content, prefixes, plainAlt);
  }

  if (!node.childNodes) {
    return;
  }

  node.childNodes = node.childNodes.filter((child) => {
    if (child.nodeName !== 'img') {
      rewrite(child, prefixes, plainAlt);
      return true;
    }

    const src = normalizeOwnMediaUrl(attr(child, 'src'), prefixes);
    if (!src) {
      return false;
    }

    const rawAlt = attr(child, 'alt') || '';
    // o HTML enviado ao provider passa pela decodificacao de entidades do
    // stripHtmlValidation: sem aspas nem `&`, o alt nao fecha o atributo
    const alt = (plainAlt ? rawAlt.replace(/["&<>]/g, '') : rawAlt).trim();
    child.attrs = [
      { name: 'src', value: src },
      ...(alt ? [{ name: 'alt', value: alt }] : []),
    ];
    return true;
  });
};

const collectSources = (node: Node, found: string[]) => {
  if (node.nodeName === 'img') {
    found.push(attr(node, 'src') || '');
  }
  if (node.content) {
    collectSources(node.content, found);
  }
  for (const child of node.childNodes || []) {
    collectSources(child, found);
  }
  return found;
};

// `src` de cada <img> (na arvore, nao por regex) — para avisar no editor o
// que vai cair e para o encurtador de links nao trocar a URL da imagem
export const imageSources = (html: string): string[] =>
  typeof html === 'string' && /<img/i.test(html)
    ? collectSources(parseFragment(html) as unknown as Node, [])
    : [];

/**
 * Mantem so as `<img>` da midia da instancia, cada uma reduzida a `src`
 * (normalizado) e `alt`. Trabalha na arvore do parse5 — nunca por regex no
 * HTML, onde um `<img` dentro do valor de outro atributo deslocaria aspas.
 *
 * `plainAlt` e para o HTML que segue ao provider (ver normalizeOwnMediaUrl).
 */
export const rewriteInlineImages = (
  html: string,
  options: { prefixes?: MediaPrefix[]; plainAlt?: boolean } = {}
): string => {
  if (typeof html !== 'string' || !/<img/i.test(html)) {
    return html;
  }

  const fragment = parseFragment(html) as unknown as Node;
  rewrite(fragment, options.prefixes || ownMediaPrefixes(), !!options.plainAlt);
  return serialize(fragment as any);
};
