import { checkPublicHttpsUrl } from '../../../dtos/validators/public-https-url';

/** Pure stable selection: safe inside Temporal and does not consume public-reply RNG. */
export function stablePrivateMessage(
  config: { message?: string; template?: string; messages?: string[] },
  seed: string,
  enabled: boolean
): string {
  if (!enabled || !config.messages?.length)
    return config.message || config.template || '';
  validatePrivateMessageVariants(config.messages);
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++)
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return config.messages[(hash >>> 0) % config.messages.length];
}

export function validatePrivateMessageVariants(
  messages: unknown
): asserts messages is string[] {
  if (
    !Array.isArray(messages) ||
    !messages.length ||
    messages.length > 10 ||
    messages.some((m) => typeof m !== 'string' || !m.trim() || m.length > 2000)
  )
    throw new Error('INVALID_MESSAGE');
}

export interface PrivateMessageVariant {
  message: string;
  buttonText?: string;
  buttonUrl?: string;
}
/** Pure, strict validation shared by API, editors and Temporal. */
export function validatePrivateButtonVariants(
  variants: unknown
): asserts variants is PrivateMessageVariant[] {
  if (!Array.isArray(variants) || !variants.length || variants.length > 10)
    throw new Error('INVALID_MESSAGE');
  for (const v of variants) {
    if (
      !v ||
      typeof v !== 'object' ||
      Array.isArray(v) ||
      Object.keys(v).some(
        (k) => !['message', 'buttonText', 'buttonUrl'].includes(k)
      ) ||
      typeof v.message !== 'string' ||
      !v.message.trim() ||
      v.message.length > 2000
    )
      throw new Error('INVALID_MESSAGE');
    if (v.buttonText !== undefined || v.buttonUrl !== undefined) {
      if (
        typeof v.buttonText !== 'string' ||
        !v.buttonText.trim() ||
        v.buttonText.length > 20 ||
        typeof v.buttonUrl !== 'string' ||
        v.buttonUrl.length > 2000 ||
        checkPublicHttpsUrl(v.buttonUrl)
      )
        throw new Error('INVALID_BUTTON');
      const url = new URL(v.buttonUrl);
      if (url.username || url.password) throw new Error('INVALID_BUTTON');
      if (v.message.length > 640) throw new Error('MESSAGE_TOO_LONG');
    }
  }
}
export function stablePrivateVariant(
  variants: PrivateMessageVariant[],
  seed: string
): PrivateMessageVariant {
  validatePrivateButtonVariants(variants);
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++)
    hash = Math.imul(hash ^ seed.charCodeAt(i), 16777619);
  return variants[(hash >>> 0) % variants.length];
}
export function assertPrivateVariantRepresentation(config: {
  variants?: unknown;
  message?: unknown;
  messages?: unknown;
  buttonText?: unknown;
  buttonUrl?: unknown;
}) {
  if (config.variants === undefined) return;
  if (
    [config.message, config.messages, config.buttonText, config.buttonUrl].some(
      (v) => v !== undefined
    )
  )
    throw new Error('AMBIGUOUS_PRIVATE_REPLY');
  validatePrivateButtonVariants(config.variants);
}
