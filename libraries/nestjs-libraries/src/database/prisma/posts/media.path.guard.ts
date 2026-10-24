import { resolve, sep } from 'path';

// Case-sensitive de proposito: e exatamente o teste (`indexOf('http')`) que
// posts.service e os providers fazem para decidir entre URL remota e caminho
// local. Um esquema em maiusculas cai no ramo local e fica confinado.
export const isRemoteMediaPath = (path: string): boolean =>
  /^https?:\/\//.test(path);

/**
 * Um `path` de midia que nao e URL remota e lido direto do disco do worker
 * (`UPLOAD_DIRECTORY + path` -> `readOrFetch`/`createReadStream` nos
 * providers). O valor vem do cliente (DTO do post, tool MCP), entao precisa
 * resolver DENTRO de `UPLOAD_DIRECTORY`; caso contrario e leitura arbitraria
 * de arquivo pelo processo de publicacao.
 *
 * - valor nao-string passa: `{ id }` e resolvido pelo banco em seguida;
 * - URL http(s) passa: e baixada pelo cliente SSRF-safe;
 * - "http" no meio do caminho e rejeitado: os providers tratariam o valor
 *   como remoto e pulariam o prefixo de UPLOAD_DIRECTORY (leitura relativa ao
 *   diretorio de trabalho);
 * - sem UPLOAD_DIRECTORY (storage remoto) nenhum caminho local e legitimo.
 */
export function isAllowedMediaPath(
  path: unknown,
  uploadDirectory: string | undefined = process.env.UPLOAD_DIRECTORY
): boolean {
  if (typeof path !== 'string') {
    return true;
  }

  if (isRemoteMediaPath(path)) {
    return true;
  }

  if (path.includes('http')) {
    return false;
  }

  if (!uploadDirectory) {
    return false;
  }

  const base = resolve(uploadDirectory);
  const candidate = resolve(uploadDirectory + path);

  return candidate.startsWith(base + sep);
}

export const filterAllowedMedia = <T extends { path?: unknown }>(
  list: T[] | undefined | null,
  uploadDirectory: string | undefined = process.env.UPLOAD_DIRECTORY
): T[] =>
  Array.isArray(list)
    ? list.filter((media) => isAllowedMediaPath(media?.path, uploadDirectory))
    : [];
