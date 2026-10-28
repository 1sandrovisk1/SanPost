import { HttpException } from '@nestjs/common';
import { z } from 'zod';
import {
  automationConfigurationSchema,
  automationConfigurationShape,
  type AutomationConfiguration,
} from '../../dtos/flows/automation-management.dto';
import { checkPublicHttpsUrl } from '../../dtos/validators/is-public-https-url.validator';
import type { SaveCanvasDto } from '../../dtos/flows/flow.dto';

export const legacyTriggerFields = [
  'triggerType',
  'mode',
  'postIds',
  'storyIds',
  'scheduledPostId',
  'keywords',
  'matchMode',
  'matchReactions',
  'requireFollow',
  'followGateMessage',
  'openingDmMessage',
  'openingDmButtonText',
  'alreadyFollowedButtonText',
  'gateExhaustedMessage',
  'maxGateAttempts',
] as const;
const gateFields = [
  'requireFollow',
  'followGateMessage',
  'openingDmMessage',
  'openingDmButtonText',
  'alreadyFollowedButtonText',
  'gateExhaustedMessage',
  'maxGateAttempts',
] as const;
export const failAutomation = (code: string, status = 400): never => {
  throw new HttpException(code, status);
};
export function parseObject(data?: string | null): Record<string, unknown> {
  try {
    const value = JSON.parse(data || '{}');
    if (!value || Array.isArray(value) || typeof value !== 'object')
      throw new Error();
    return value;
  } catch {
    return failAutomation('INVALID_NODE_CONFIG');
  }
}
export function validateAutomationConfiguration(
  input: unknown
): AutomationConfiguration {
  const parsed = automationConfigurationSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpException(
      {
        message: 'INVALID_AUTOMATION_CONFIG',
        fields: parsed.error.issues.map((i) => i.path.join('.')),
      },
      400
    );
  const c = parsed.data;
  const platform = c.platform || 'instagram';
  const triggerType = c.triggerType || 'comment_on_post';
  const messenger = triggerType === 'messenger_message';
  const postMode = c.postMode || (messenger ? 'all' : 'next_publication');
  if (!c.name.trim() || !c.integrationId.trim())
    failAutomation('INVALID_AUTOMATION_CONFIG');
  if (c.scheduledPostId && postMode !== 'scheduled')
    failAutomation('SCHEDULED_MODE_REQUIRED');
  if (
    postMode === 'scheduled' &&
    (!c.scheduledPostId ||
      triggerType !== 'comment_on_post' ||
      c.postIds?.length ||
      c.storyIds?.length)
  )
    failAutomation('INVALID_SCHEDULED_SELECTION');
  if (postMode !== 'specific' && (c.postIds?.length || c.storyIds?.length))
    failAutomation('POST_MODE_MISMATCH');
  if (
    c.postIds?.some((id) => !/^\d+(?:_\d+)?$/.test(id)) ||
    c.storyIds?.some((id) => !/^\d+$/.test(id))
  )
    failAutomation('INVALID_POST_SELECTION');
  if (
    triggerType !== 'story_reply' &&
    (c.storyIds?.length || c.matchReactions !== undefined)
  )
    failAutomation('STORY_OPTION_UNSUPPORTED');
  if (
    triggerType === 'story_reply' &&
    (platform !== 'instagram' ||
      c.postIds?.length ||
      c.aliasMediaIds?.length ||
      c.replyMessage ||
      c.replyMessages?.length ||
      c.openingDmMessage ||
      c.openingDmButtonText ||
      c.alreadyFollowedButtonText ||
      c.gateExhaustedMessage ||
      c.maxGateAttempts !== undefined)
  )
    failAutomation('STORY_OPTION_UNSUPPORTED');
  if (platform === 'facebook' && gateFields.some((k) => c[k] !== undefined))
    failAutomation('FACEBOOK_OPTION_UNSUPPORTED');
  if (platform === 'facebook' && c.aliasMediaIds?.length)
    failAutomation('INSTAGRAM_ALIASES_ONLY');
  if (
    messenger &&
    (platform !== 'facebook' ||
      postMode !== 'all' ||
      c.postIds?.length ||
      c.scheduledPostId ||
      c.replyMessage ||
      c.replyMessages?.length ||
      !c.keywords?.length)
  )
    failAutomation('INVALID_MESSENGER_CONFIG');
  if (!messenger && c.priority !== undefined)
    failAutomation('MESSENGER_PRIORITY_ONLY');
  if (
    postMode === 'specific' &&
    (triggerType === 'story_reply'
      ? !c.storyIds?.length
      : !c.postIds?.length && !c.aliasMediaIds?.length)
  )
    failAutomation('INVALID_POST_SELECTION');
  if (
    c.aliasMediaIds?.length &&
    (platform !== 'instagram' || triggerType !== 'comment_on_post')
  )
    failAutomation('INSTAGRAM_ALIASES_ONLY');
  if (
    c.keywords?.some((k) => !k.trim()) ||
    c.replyMessages?.some((m) => !m.trim())
  )
    failAutomation('EMPTY_VARIATION_OR_KEYWORD');
  if (c.replyMessage && c.replyMessages?.length)
    failAutomation('AMBIGUOUS_PUBLIC_REPLY');
  if (c.dmMessages?.some((m) => !m.trim()))
    failAutomation('EMPTY_VARIATION_OR_KEYWORD');
  if (c.dmMessage && c.dmMessages?.length)
    failAutomation('AMBIGUOUS_PRIVATE_REPLY');
  const privateTexts =
    c.dmMessages || (c.dmMessage?.trim() ? [c.dmMessage] : []);
  if (
    c.dmMessages &&
    c.dmButtonText &&
    c.dmMessages.some((m) => m.length > 640)
  )
    failAutomation('MESSAGE_TOO_LONG');
  if (c.dmButtonText || c.dmButtonUrl) {
    if (
      !privateTexts.length ||
      !c.dmButtonText?.trim() ||
      !c.dmButtonUrl ||
      checkPublicHttpsUrl(c.dmButtonUrl)
    )
      failAutomation('INVALID_BUTTON');
    if (
      platform === 'facebook' &&
      (c.dmButtonText.length > 20 ||
        privateTexts.some((m) => m.length > 640) ||
        c.dmButtonUrl.length > 2000)
    )
      failAutomation('MESSAGE_TOO_LONG');
  }
  if (
    (c.activate !== false || platform === 'facebook') &&
    !privateTexts.length &&
    !c.replyMessage?.trim() &&
    !c.replyMessages?.length
  )
    failAutomation('ACTION_REQUIRED');
  return {
    ...c,
    platform,
    triggerType,
    postMode,
    ...(messenger ? { priority: c.priority ?? 10 } : {}),
  };
}
type Graph = {
  nodes: Array<{ id: string; type: string; data?: string | null }>;
  edges: Array<{
    sourceNodeId: string;
    targetNodeId: string;
    sourceHandle?: string | null;
  }>;
};
export function isQuickGraph(graph: Graph): boolean {
  const triggers = graph.nodes.filter((n) => n.type === 'TRIGGER');
  const replies = graph.nodes.filter((n) => n.type === 'REPLY_COMMENT');
  const dms = graph.nodes.filter((n) => n.type === 'SEND_DM');
  if (
    triggers.length !== 1 ||
    replies.length > 1 ||
    dms.length > 1 ||
    graph.nodes.length !== triggers.length + replies.length + dms.length
  )
    return false;
  const order = [...triggers, ...replies, ...dms];
  return (
    graph.edges.length === order.length - 1 &&
    order
      .slice(1)
      .every((n, i) =>
        graph.edges.some(
          (e) =>
            e.sourceNodeId === order[i].id &&
            e.targetNodeId === n.id &&
            !e.sourceHandle
        )
      )
  );
}
export function legacyConfiguration(
  flow: { name: string; integrationId: string } & Graph,
  aliasMediaIds: string[]
): AutomationConfiguration | null {
  if (!isQuickGraph(flow)) return null;
  const trigger = parseObject(
    flow.nodes.find((n) => n.type === 'TRIGGER')?.data
  );
  if (
    Object.keys(trigger).some(
      (k) =>
        !legacyTriggerFields.includes(k as (typeof legacyTriggerFields)[number])
    )
  )
    return null;
  const config: Record<string, unknown> = {
    name: flow.name,
    integrationId: flow.integrationId,
    platform: 'instagram',
    postMode:
      trigger.mode ||
      ((trigger.postIds as string[])?.length ||
      (trigger.storyIds as string[])?.length
        ? 'specific'
        : 'all'),
    aliasMediaIds,
  };
  for (const key of legacyTriggerFields)
    if (key !== 'mode' && trigger[key] !== undefined)
      config[key] = trigger[key];
  const reply = flow.nodes.find((n) => n.type === 'REPLY_COMMENT');
  const dm = flow.nodes.find((n) => n.type === 'SEND_DM');
  if (reply) {
    const data = parseObject(reply.data);
    if (Object.keys(data).some((k) => !['message', 'messages'].includes(k)))
      return null;
    config.replyMessages =
      Array.isArray(data.messages) && data.messages.length
        ? data.messages
        : [data.message];
  }
  if (dm) {
    const data = parseObject(dm.data);
    if (
      Object.keys(data).some(
        (k) => !['message', 'messages', 'buttonText', 'buttonUrl'].includes(k)
      )
    )
      return null;
    if (Array.isArray(data.messages)) config.dmMessages = data.messages;
    else config.dmMessage = data.message;
    config.dmButtonText = data.buttonText;
    config.dmButtonUrl = data.buttonUrl;
  }
  return config as AutomationConfiguration;
}
export function validateLegacyCanvas(
  body: SaveCanvasDto,
  aliasMediaIds: string[] = []
) {
  if (
    !body.nodes?.length ||
    body.nodes.length > 100 ||
    body.edges.length > 200 ||
    JSON.stringify(body).length > 131072
  )
    failAutomation('INVALID_GRAPH');
  const triggerSchema = z
    .object({
      triggerType: z.enum(['comment_on_post', 'story_reply']).optional(),
      mode: automationConfigurationShape.postMode,
      postIds: automationConfigurationShape.postIds,
      storyIds: automationConfigurationShape.storyIds,
      scheduledPostId: automationConfigurationShape.scheduledPostId,
      keywords: automationConfigurationShape.keywords,
      matchMode: automationConfigurationShape.matchMode,
      matchReactions: automationConfigurationShape.matchReactions,
      requireFollow: automationConfigurationShape.requireFollow,
      followGateMessage: automationConfigurationShape.followGateMessage,
      openingDmMessage: automationConfigurationShape.openingDmMessage,
      openingDmButtonText: automationConfigurationShape.openingDmButtonText,
      alreadyFollowedButtonText:
        automationConfigurationShape.alreadyFollowedButtonText,
      gateExhaustedMessage: automationConfigurationShape.gateExhaustedMessage,
      maxGateAttempts: automationConfigurationShape.maxGateAttempts,
    })
    .strict();
  const schemas: Record<string, z.ZodTypeAny> = {
    TRIGGER: triggerSchema,
    CONDITION: z
      .object({
        keywords: automationConfigurationShape.keywords,
        matchMode: automationConfigurationShape.matchMode,
      })
      .strict(),
    DELAY: z
      .object({
        duration: z.number().int().min(0).max(86400),
        unit: z.enum(['seconds', 'minutes', 'hours']).optional(),
      })
      .strict(),
    REPLY_COMMENT: z
      .object({
        message: automationConfigurationShape.replyMessage,
        messages: automationConfigurationShape.replyMessages,
      })
      .strict(),
    SEND_DM: z
      .object({
        message: automationConfigurationShape.dmMessage,
        messages: automationConfigurationShape.dmMessages,
        buttonText: automationConfigurationShape.dmButtonText,
        buttonUrl: automationConfigurationShape.dmButtonUrl,
      })
      .strict(),
  };
  const seen = new Set<string>();
  for (const node of body.nodes) {
    if (
      !node.id ||
      seen.has(node.id) ||
      !schemas[node.type] ||
      !Number.isFinite(node.positionX) ||
      !Number.isFinite(node.positionY)
    )
      failAutomation('INVALID_GRAPH');
    seen.add(node.id);
    const cfg = parseObject(node.data);
    if (!schemas[node.type].safeParse(cfg).success)
      failAutomation('INVALID_NODE_CONFIG');
    if (
      node.type === 'SEND_DM' &&
      ((cfg.buttonUrl && checkPublicHttpsUrl(String(cfg.buttonUrl))) ||
        !!cfg.buttonText !== !!cfg.buttonUrl)
    )
      failAutomation('INVALID_BUTTON');
    if (
      ['SEND_DM', 'REPLY_COMMENT'].includes(node.type) &&
      !String(cfg.message || '').trim() &&
      !(cfg.messages as string[])?.some((m) => m.trim())
    )
      failAutomation('ACTION_REQUIRED');
  }
  const triggers = body.nodes.filter((n) => n.type === 'TRIGGER');
  if (triggers.length !== 1) failAutomation('INVALID_GRAPH');
  const trigger = parseObject(triggers[0].data);
  const { mode, ...settings } = trigger;
  const story =
    trigger.triggerType === 'story_reply' ||
    triggers[0].label === 'story_reply';
  if (story && body.nodes.some((n) => n.type === 'REPLY_COMMENT'))
    failAutomation('STORY_OPTION_UNSUPPORTED');
  validateAutomationConfiguration({
    name: 'Canvas',
    integrationId: 'canvas',
    platform: 'instagram',
    ...settings,
    triggerType: story ? 'story_reply' : 'comment_on_post',
    postMode:
      mode ||
      ((trigger.postIds as string[])?.length ||
      (trigger.storyIds as string[])?.length
        ? 'specific'
        : 'all'),
    aliasMediaIds,
    activate: false,
  });
  const outgoing = new Set<string>();
  for (const edge of body.edges) {
    const source = body.nodes.find((n) => n.id === edge.sourceNodeId);
    const key = `${edge.sourceNodeId}:${edge.sourceHandle || 'match'}`;
    if (
      !source ||
      !seen.has(edge.targetNodeId) ||
      edge.targetNodeId === triggers[0].id ||
      outgoing.has(key) ||
      (edge.sourceHandle &&
        (source.type !== 'CONDITION' ||
          !['match', 'no_match'].includes(edge.sourceHandle)))
    )
      failAutomation('INVALID_GRAPH');
    outgoing.add(key);
  }
  const visited = new Set<string>();
  const visit = (id: string, path: Set<string>) => {
    if (path.has(id)) failAutomation('INVALID_GRAPH');
    if (visited.has(id)) return;
    visited.add(id);
    for (const edge of body.edges.filter((e) => e.sourceNodeId === id))
      visit(edge.targetNodeId, new Set(path).add(id));
  };
  visit(triggers[0].id!, new Set());
  if (visited.size !== body.nodes.length) failAutomation('INVALID_GRAPH');
}
