/** Pure canonical graph used by the shared wizard, canvas and workflow. No IO or credentials. */
export type CommentNodeType =
  | 'TRIGGER'
  | 'CONDITION'
  | 'DELAY'
  | 'SEND_DM'
  | 'REPLY_COMMENT';
export interface CommentNode {
  id: string;
  type: CommentNodeType;
  data: string;
  positionX: number;
  positionY: number;
  label?: string;
}
export interface CommentEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourceHandle?: string;
}
export interface CommentDefinition {
  nodes: CommentNode[];
  edges: CommentEdge[];
}
export interface CommentAction {
  key: string;
  kind: 'private_reply' | 'public_reply' | 'messenger_reply';
  text: string;
  delaySeconds: number;
  button?: { title: string; url: string };
}
type Config = {
  triggerType?: string;
  priority?: number;
  keywords?: string[];
  matchMode?: string;
  message?: string;
  messages?: string[];
  buttonText?: string;
  buttonUrl?: string;
  duration?: number;
  unit?: string;
};
const allowed: Record<CommentNodeType, string[]> = {
  TRIGGER: ['triggerType', 'keywords', 'matchMode', 'priority'],
  CONDITION: ['keywords', 'matchMode'],
  DELAY: ['duration', 'unit'],
  SEND_DM: ['message', 'buttonText', 'buttonUrl'],
  REPLY_COMMENT: ['message', 'messages'],
};
function config(node: CommentNode): Config {
  let value: Config;
  try {
    value = JSON.parse(node.data);
  } catch {
    throw new Error('INVALID_GRAPH');
  }
  if (!value || Array.isArray(value) || typeof value !== 'object')
    throw new Error('INVALID_GRAPH');
  if (
    node.type === 'TRIGGER' &&
    value.triggerType &&
    !['comment_on_post', 'messenger_message'].includes(value.triggerType)
  )
    throw new Error('UNSUPPORTED_TRIGGER');
  if (node.type === 'TRIGGER' && value.triggerType === 'messenger_message') {
    if (!Array.isArray(value.keywords) || !value.keywords.length)
      throw new Error('MESSENGER_KEYWORDS_REQUIRED');
    if (
      !Number.isInteger(value.priority) ||
      value.priority < 1 ||
      value.priority > 1000
    )
      throw new Error('INVALID_PRIORITY');
  } else if (value.priority !== undefined)
    throw new Error('UNSUPPORTED_CONFIG');
  if (Object.keys(value).some((key) => !allowed[node.type]?.includes(key)))
    throw new Error('UNSUPPORTED_CONFIG');
  if (
    value.keywords !== undefined &&
    (!Array.isArray(value.keywords) ||
      value.keywords.length > 50 ||
      value.keywords.some(
        (k) => typeof k !== 'string' || !k.trim() || k.length > 100
      ))
  )
    throw new Error('INVALID_KEYWORDS');
  if (value.matchMode && !['any', 'all', 'exact'].includes(value.matchMode))
    throw new Error('INVALID_KEYWORDS');
  if (
    value.message !== undefined &&
    (typeof value.message !== 'string' ||
      value.message.length > (node.type === 'SEND_DM' ? 2000 : 2200))
  )
    throw new Error('MESSAGE_TOO_LONG');
  if (
    value.messages !== undefined &&
    (!Array.isArray(value.messages) ||
      !value.messages.length ||
      value.messages.length > 10 ||
      value.messages.some(
        (m) => typeof m !== 'string' || !m.trim() || m.length > 2200
      ))
  )
    throw new Error('INVALID_MESSAGE');
  if (
    ['SEND_DM', 'REPLY_COMMENT'].includes(node.type) &&
    !value.message?.trim() &&
    !value.messages?.some((message) => message.trim())
  )
    throw new Error('INVALID_MESSAGE');
  if (
    node.type === 'DELAY' &&
    (!Number.isInteger(value.duration) ||
      value.duration < 0 ||
      value.duration > 86400 ||
      !['seconds', 'minutes', 'hours'].includes(value.unit || 'seconds'))
  )
    throw new Error('INVALID_DELAY');
  if (value.buttonText || value.buttonUrl) {
    let url: URL;
    try {
      url = new URL(value.buttonUrl || '');
    } catch {
      throw new Error('INVALID_BUTTON');
    }
    if (
      !value.buttonText?.trim() ||
      value.buttonText.length > 20 ||
      value.buttonUrl.length > 2000 ||
      url.protocol !== 'https:' ||
      url.username ||
      url.password
    )
      throw new Error('INVALID_BUTTON');
  }
  return value;
}
export function normalizeDefinition(
  input: CommentDefinition
): CommentDefinition {
  if (
    !input ||
    !Array.isArray(input.nodes) ||
    !Array.isArray(input.edges) ||
    !input.nodes.length ||
    input.nodes.length > 30 ||
    input.edges.length > 60 ||
    JSON.stringify(input).length > 65536
  )
    throw new Error('INVALID_GRAPH');
  const ids = new Set<string>();
  for (const node of input.nodes) {
    if (
      !node ||
      !/^[\w-]{1,80}$/.test(node.id) ||
      ids.has(node.id) ||
      !allowed[node.type] ||
      !Number.isFinite(node.positionX) ||
      !Number.isFinite(node.positionY)
    )
      throw new Error('INVALID_GRAPH');
    ids.add(node.id);
    config(node);
  }
  const triggers = input.nodes.filter((n) => n.type === 'TRIGGER');
  if (
    triggers.length !== 1 ||
    !input.nodes.some((n) => ['SEND_DM', 'REPLY_COMMENT'].includes(n.type))
  )
    throw new Error('INVALID_GRAPH');
  if (
    config(triggers[0]).triggerType === 'messenger_message' &&
    input.nodes.some((n) => n.type === 'REPLY_COMMENT')
  )
    throw new Error('MESSENGER_PUBLIC_REPLY_UNSUPPORTED');
  const edgeKeys = new Set<string>();
  for (const edge of input.edges) {
    const source = input.nodes.find((n) => n.id === edge.sourceNodeId);
    const key = `${edge.sourceNodeId}:${edge.sourceHandle || 'match'}`;
    if (
      !source ||
      !ids.has(edge.targetNodeId) ||
      edge.targetNodeId === triggers[0].id ||
      edgeKeys.has(key) ||
      (edge.sourceHandle &&
        (source.type !== 'CONDITION' ||
          !['match', 'no_match'].includes(edge.sourceHandle)))
    )
      throw new Error('INVALID_GRAPH');
    edgeKeys.add(key);
  }
  const visited = new Set<string>();
  const order: string[] = [];
  const walk = (id: string, path: Set<string>) => {
    if (path.has(id)) throw new Error('INVALID_GRAPH');
    if (visited.has(id)) return;
    visited.add(id);
    const next = new Set(path).add(id);
    for (const edge of input.edges.filter((e) => e.sourceNodeId === id))
      walk(edge.targetNodeId, next);
    order.push(id);
  };
  walk(triggers[0].id, new Set());
  if (visited.size !== ids.size) throw new Error('INVALID_GRAPH');
  // At most eight states per node; lengths from mutually exclusive button
  // paths remain separate. No expansion of converging paths.
  type Bounds = {
    dm: boolean;
    gap: boolean;
    button: boolean;
    length: number;
    delay: number;
  };
  const states = new Map<string, Map<string, Bounds>>();
  states.set(
    triggers[0].id,
    new Map([
      [
        'initial',
        { dm: false, gap: false, button: false, length: 0, delay: 0 },
      ],
    ])
  );
  for (const id of order.reverse()) {
    const node = input.nodes.find((n) => n.id === id)!;
    const cfg = config(node);
    for (const prior of states.get(id)?.values() || []) {
      const state = { ...prior };
      if (node.type === 'SEND_DM') {
        if (state.dm && state.gap) throw new Error('PRIVATE_REPLY_ORDER');
        state.length += (cfg.message || '').length + (state.dm ? 2 : 0);
        state.dm = true;
        state.button ||= !!cfg.buttonUrl;
      }
      if (['DELAY', 'REPLY_COMMENT'].includes(node.type) && state.dm)
        state.gap = true;
      if (node.type === 'DELAY')
        state.delay +=
          cfg.duration *
          { seconds: 1, minutes: 60, hours: 3600 }[cfg.unit || 'seconds'];
      if (state.length > (state.button ? 640 : 2000))
        throw new Error('MESSAGE_TOO_LONG');
      if (state.delay > 86400) throw new Error('INVALID_DELAY');
      if (
        config(triggers[0]).triggerType === 'messenger_message' &&
        state.delay >= 86400
      )
        throw new Error('MESSENGER_DELAY_TOO_LONG');
      for (const edge of input.edges.filter((e) => e.sourceNodeId === id)) {
        const target =
          states.get(edge.targetNodeId) || new Map<string, Bounds>();
        const key = `${state.dm}:${state.gap}:${state.button}`;
        const old = target.get(key);
        target.set(key, {
          ...state,
          length: Math.max(state.length, old?.length || 0),
          delay: Math.max(state.delay, old?.delay || 0),
        });
        states.set(edge.targetNodeId, target);
      }
    }
  }
  return {
    nodes: input.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      data: JSON.stringify(config(n)),
      positionX: n.positionX,
      positionY: n.positionY,
      ...(n.label ? { label: n.label.slice(0, 100) } : {}),
    })),
    edges: input.edges.map((e) => ({
      id: e.id,
      sourceNodeId: e.sourceNodeId,
      targetNodeId: e.targetNodeId,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
    })),
  };
}
export function matchesKeywords(cfg: Config, text: string) {
  const keys = cfg.keywords || [];
  const normalized = text.toLocaleLowerCase().trim();
  return (
    !keys.length ||
    (cfg.matchMode === 'exact'
      ? keys.some((k) => normalized === k.toLocaleLowerCase().trim())
      : cfg.matchMode === 'all'
      ? keys.every((k) => normalized.includes(k.toLocaleLowerCase().trim()))
      : keys.some((k) => normalized.includes(k.toLocaleLowerCase().trim())))
  );
}
export function planCommentActions(
  input: CommentDefinition,
  comment: {
    text: string;
    actorName?: string;
    commentId?: string;
    postId?: string;
  },
  // Pure callers default to the first alternative; ingestion injects randomInt.
  chooseReplyIndex: (count: number) => number = () => 0
): CommentAction[] {
  const graph = normalizeDefinition(input);
  const messenger = getTriggerType(graph) === 'messenger_message';
  const render = (text: string) =>
    text.replace(
      /\{\{\s*(comment_name|comment_text|comment_id|media_id)\s*\}\}/g,
      (_, key: 'comment_name' | 'comment_text' | 'comment_id' | 'media_id') =>
        ({
          comment_name: comment.actorName || '',
          comment_text: comment.text,
          comment_id: comment.commentId || '',
          media_id: comment.postId || '',
        }[key])
    );
  let node = graph.nodes.find((n) => n.type === 'TRIGGER');
  let delaySeconds = 0;
  const actions: CommentAction[] = [];
  const messages: string[] = [];
  let button: CommentAction['button'];
  let privateAction: CommentAction | undefined;
  while (node) {
    const cfg = config(node);
    let branch = 'match';
    if (node.type === 'TRIGGER' && !matchesKeywords(cfg, comment.text))
      return [];
    if (node.type === 'CONDITION')
      branch = matchesKeywords(cfg, comment.text) ? 'match' : 'no_match';
    if (node.type === 'DELAY')
      delaySeconds +=
        cfg.duration *
        { seconds: 1, minutes: 60, hours: 3600 }[cfg.unit || 'seconds'];
    if (node.type === 'SEND_DM') {
      if (cfg.message?.trim()) {
        messages.push(render(cfg.message));
        if (!privateAction) {
          privateAction = {
            key: messenger ? 'messenger_reply' : 'private_reply',
            kind: messenger ? 'messenger_reply' : 'private_reply',
            text: '',
            delaySeconds,
          };
          actions.push(privateAction);
        }
      }
      if (cfg.buttonUrl) button = { title: cfg.buttonText, url: cfg.buttonUrl };
    }
    if (node.type === 'REPLY_COMMENT') {
      const alternatives = cfg.messages || [cfg.message || ''];
      const index =
        alternatives.length > 1 ? chooseReplyIndex(alternatives.length) : 0;
      if (!Number.isInteger(index) || index < 0 || index >= alternatives.length)
        throw new Error('INVALID_MESSAGE');
      const text = render(alternatives[index]);
      if (text.trim())
        actions.push({
          key: `public:${node.id}`,
          kind: 'public_reply',
          text,
          delaySeconds,
        });
    }
    const edge = graph.edges.find(
      (e) =>
        e.sourceNodeId === node.id && (e.sourceHandle || 'match') === branch
    );
    node = graph.nodes.find((n) => n.id === edge?.targetNodeId);
  }
  if (privateAction) {
    privateAction.text = messages.join('\n\n');
    if (button) privateAction.button = button;
  }
  if (
    actions.some(
      (a) =>
        a.text.length >
        (a.kind !== 'public_reply' ? (a.button ? 640 : 2000) : 2200)
    )
  )
    throw new Error('MESSAGE_TOO_LONG');
  return actions;
}
export type AutomationTriggerType = 'comment_on_post' | 'messenger_message';
export function getTriggerType(
  input?: CommentDefinition
): AutomationTriggerType {
  const node = input?.nodes?.find((n) => n.type === 'TRIGGER');
  if (!node) return 'comment_on_post';
  try {
    return JSON.parse(node.data).triggerType === 'messenger_message'
      ? 'messenger_message'
      : 'comment_on_post';
  } catch {
    return 'comment_on_post';
  }
}
export function simpleDefinition(input: {
  triggerType?: AutomationTriggerType;
  priority?: number;
  keywords?: string[];
  matchMode?: string;
  message: string;
  reply?: string;
  replyMessages?: string[];
  buttonText?: string;
  buttonUrl?: string;
}): CommentDefinition {
  const nodes: CommentNode[] = [
    {
      id: 'trigger',
      type: 'TRIGGER',
      data: JSON.stringify({
        triggerType: input.triggerType || 'comment_on_post',
        ...(input.triggerType === 'messenger_message'
          ? { priority: input.priority ?? 10 }
          : {}),
        keywords: input.keywords || [],
        matchMode: input.matchMode || 'any',
      }),
      positionX: 250,
      positionY: 30,
    },
  ];
  const hasReply = !!input.reply || !!input.replyMessages?.length;
  if (hasReply)
    nodes.push({
      id: 'reply',
      type: 'REPLY_COMMENT',
      data: JSON.stringify({
        ...(input.reply ? { message: input.reply } : {}),
        ...(input.replyMessages?.length
          ? { messages: input.replyMessages }
          : {}),
      }),
      positionX: 250,
      positionY: 180,
    });
  nodes.push({
    id: 'dm',
    type: 'SEND_DM',
    data: JSON.stringify({
      message: input.message,
      ...(input.buttonUrl
        ? { buttonText: input.buttonText, buttonUrl: input.buttonUrl }
        : {}),
    }),
    positionX: 250,
    positionY: hasReply ? 330 : 180,
  });
  return {
    nodes,
    edges: nodes.slice(1).map((node, i) => ({
      id: `edge-${i}`,
      sourceNodeId: nodes[i].id,
      targetNodeId: node.id,
    })),
  };
}
