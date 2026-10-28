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
