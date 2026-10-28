export type PreviewJourneyStage = 'opening' | 'gate' | 'exhausted' | 'delivery';
export type PreviewMessage = {
  role: 'page' | 'user';
  text: string;
  button?: { kind: 'reply' | 'link'; text: string; url?: string };
};
export interface PreviewJourneyContent {
  message?: string;
  buttonText?: string;
  buttonUrl?: string;
  incomingMessage?: string;
  followGate?: boolean;
  story?: boolean;
  stage?: PreviewJourneyStage;
  openingMessage?: string;
  openingButton?: string;
  gateMessage?: string;
  gateButton?: string;
  exhaustedMessage?: string;
}
export function buildPreviewJourney(
  content: PreviewJourneyContent
): PreviewMessage[] {
  const delivery: PreviewMessage[] = content.message
    ? [
        {
          role: 'page',
          text: content.message,
          ...(content.buttonText && content.buttonUrl
            ? {
                button: {
                  kind: 'link' as const,
                  text: content.buttonText,
                  url: content.buttonUrl,
                },
              }
            : {}),
        },
      ]
    : [];
  if (!content.followGate)
    return [
      ...(content.incomingMessage
        ? [{ role: 'user' as const, text: content.incomingMessage }]
        : []),
      ...delivery,
    ];
  const stage = content.stage || 'delivery';
  if (content.story)
    return stage === 'gate'
      ? [{ role: 'page', text: content.gateMessage || '' }]
      : delivery;
  const messages: PreviewMessage[] = [
    {
      role: 'page',
      text: content.openingMessage || '',
      button: { kind: 'reply', text: content.openingButton || '' },
    },
  ];
  if (stage === 'opening') return messages;
  messages.push({ role: 'user', text: content.openingButton || '' });
  if (stage === 'delivery') return [...messages, ...delivery];
  messages.push({
    role: 'page',
    text: content.gateMessage || '',
    button: { kind: 'reply', text: content.gateButton || '' },
  });
  if (stage === 'exhausted')
    messages.push(
      { role: 'user', text: content.gateButton || '' },
      { role: 'page', text: content.exhaustedMessage || '' }
    );
  return messages;
}
