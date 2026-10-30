/** CopilotKit 1.72 accepts both legacy strings and structured content parts. */
export function getAgentMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .filter(
      (part): part is { type: 'text'; text: string } =>
        part?.type === 'text' && typeof part.text === 'string'
    )
    .map((part) => part.text)
    .join('\n');
}
