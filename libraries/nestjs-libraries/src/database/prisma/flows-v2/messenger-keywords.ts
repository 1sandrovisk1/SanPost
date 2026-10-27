import {
  CommentDefinition,
  matchesKeywords,
  normalizeDefinition,
} from './flow-definition';

export function messengerRule(definition: CommentDefinition) {
  const graph = normalizeDefinition(definition);
  const config = JSON.parse(
    graph.nodes.find((n) => n.type === 'TRIGGER')!.data
  ) as {
    triggerType?: string;
    keywords?: string[];
    matchMode?: string;
    priority?: number;
  };
  if (config.triggerType !== 'messenger_message')
    throw new Error('UNSUPPORTED_TRIGGER');
  return {
    priority: config.priority!,
    fingerprint: JSON.stringify([
      config.matchMode || 'any',
      [
        ...new Set(config.keywords!.map((k) => k.toLocaleLowerCase().trim())),
      ].sort(),
    ]),
    matches: (text: string) => matchesKeywords(config, text),
  };
}

/** Pick by trigger before evaluating conditions. Never fall through to another flow. */
export function selectMessengerWinner(
  candidates: { id: string; definition: CommentDefinition }[],
  text: string
): { winner?: string; skipped: string[] } {
  const matches = candidates
    .map((candidate) => ({
      ...candidate,
      rule: messengerRule(candidate.definition),
    }))
    .filter((candidate) => candidate.rule.matches(text))
    .sort(
      (a, b) => a.rule.priority - b.rule.priority || a.id.localeCompare(b.id)
    );
  if (new Set(matches.map((c) => c.rule.priority)).size !== matches.length)
    throw new Error('MESSENGER_PRIORITY_CONFLICT');
  return {
    ...(matches[0] ? { winner: matches[0].id } : {}),
    skipped: matches.slice(1).map((c) => c.id),
  };
}
