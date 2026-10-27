const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Equivalente de `makeSecureId` para o navegador (Web Crypto, sem
 * `node:crypto`): use no frontend quando o valor funciona como segredo
 * (ex.: palavra do `/connect` do Telegram). Rejection sampling sobre
 * `crypto.getRandomValues` para nao enviesar o alfabeto base62.
 */
export const makeWebSecureId = (length: number): string => {
  if (length <= 0) {
    return '';
  }
  const max = Math.floor(256 / ALPHABET.length) * ALPHABET.length; // 248
  let out = '';
  while (out.length < length) {
    const bytes = globalThis.crypto.getRandomValues(
      new Uint8Array(length - out.length)
    );
    for (let i = 0; i < bytes.length && out.length < length; i += 1) {
      if (bytes[i] < max) {
        out += ALPHABET.charAt(bytes[i] % ALPHABET.length);
      }
    }
  }
  return out;
};
