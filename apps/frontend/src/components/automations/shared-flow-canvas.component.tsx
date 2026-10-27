'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  Controls,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { TriggerNode } from './nodes/trigger-node';
import { ConditionNode } from './nodes/condition-node';
import { ReplyCommentNode } from './nodes/reply-comment-node';
import { SendDmNode } from './nodes/send-dm-node';
import { DelayNode } from './nodes/delay-node';
import { MessengerPriority } from './messenger-priority.component';
import { getTriggerType } from '@gitroom/nestjs-libraries/database/prisma/flows-v2/flow-definition';
import { CommaSeparatedKeywordsInput } from './comma-separated-keywords-input.component';
import { SharedReplyVariations } from './shared-reply-variations.component';
import type {
  CommentDefinition,
  CommentNodeType,
} from '@gitroom/nestjs-libraries/database/prisma/flows-v2/flow-definition';
const types = {
  TRIGGER: TriggerNode,
  CONDITION: ConditionNode,
  REPLY_COMMENT: ReplyCommentNode,
  SEND_DM: SendDmNode,
  DELAY: DelayNode,
};
const labels = {
  TRIGGER: 'node_trigger',
  CONDITION: 'node_condition',
  REPLY_COMMENT: 'node_reply',
  SEND_DM: 'node_dm',
  DELAY: 'node_delay',
};
export function SharedFlowCanvas({
  definition,
  onChange,
  disabled,
  channels = [],
  focusNodeId,
}: {
  definition: CommentDefinition;
  onChange: (graph: CommentDefinition) => void;
  disabled: boolean;
  focusNodeId?: string;
  channels?: Array<{
    platform: string;
    name: string;
    postMode: string;
    postIds: string[];
  }>;
}) {
  const t = useT();
  const messenger = getTriggerType(definition) === 'messenger_message';
  const [colorMode, setColorMode] = useState<'dark' | 'light'>('dark');
  useEffect(() => {
    const sync = () =>
      setColorMode(
        document.body.classList.contains('light') ? 'light' : 'dark'
      );
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);
  const currentDefinition = useRef(definition);
  currentDefinition.current = definition;
  const publish = (graph: CommentDefinition) => {
    currentDefinition.current = graph;
    onChange(graph);
  };
  const [selected, select] = useState<string | null>(null);
  useEffect(() => {
    if (focusNodeId) select(focusNodeId);
  }, [focusNodeId]);
  const [visualNodes, setVisualNodes] = useState<Node[]>([]);
  const [visualEdges, setVisualEdges] = useState<Edge[]>([]);
  useEffect(() => {
    setVisualNodes((previous) =>
      definition.nodes.map((n) => ({
        ...previous.find((item) => item.id === n.id),
        id: n.id,
        type: n.type,
        position: { x: n.positionX, y: n.positionY },
        data: { label: n.label, config: n.data },
        deletable: n.type !== 'TRIGGER',
      }))
    );
    setVisualEdges((previous) =>
      definition.edges.map((e) => ({
        ...previous.find((item) => item.id === e.id),
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        sourceHandle: e.sourceHandle,
      }))
    );
  }, [definition]);
  const node = definition.nodes.find((n) => n.id === selected);
  const cfg = node ? JSON.parse(node.data) : {};
  const update = (data: Record<string, unknown>) =>
    publish({
      ...definition,
      nodes: definition.nodes.map((n) =>
        n.id === selected
          ? { ...n, data: JSON.stringify({ ...cfg, ...data }) }
          : n
      ),
    });
  const input =
    'w-full border border-newTableBorder rounded-lg p-2 bg-newBgColorInner text-textColor';
  return (
    <div className="border border-newTableBorder rounded-lg overflow-hidden">
      <div className="flex flex-wrap gap-2 p-3">
        {(Object.keys(types) as CommentNodeType[])
          .filter(
            (type) =>
              type !== 'TRIGGER' && !(messenger && type === 'REPLY_COMMENT')
          )
          .map((type) => (
            <button
              disabled={disabled}
              key={type}
              className="border border-newTableBorder rounded-lg px-3 py-2 text-sm disabled:opacity-40"
              onClick={() => {
                const id = crypto.randomUUID();
                publish({
                  ...definition,
                  nodes: [
                    ...definition.nodes,
                    {
                      id,
                      type,
                      data:
                        type === 'DELAY'
                          ? '{"duration":5,"unit":"seconds"}'
                          : type === 'CONDITION'
                          ? '{"keywords":[],"matchMode":"any"}'
                          : '{"message":""}',
                      positionX: 250,
                      positionY: definition.nodes.length * 160,
                    },
                  ],
                });
                select(id);
              }}
            >
              {t(labels[type], type)}
            </button>
          ))}
      </div>
      <div className="flex flex-col lg:flex-row min-h-[600px]">
        <div className="w-full min-w-0 h-[600px] min-h-[600px] shrink-0 lg:flex-1">
          <ReactFlowProvider>
            <ReactFlow
              nodeTypes={types}
              nodes={visualNodes.map((n) =>
                n.type === 'TRIGGER'
                  ? { ...n, data: { ...n.data, channels } }
                  : n
              )}
              edges={visualEdges}
              colorMode={colorMode}
              fitView
              fitViewOptions={{ maxZoom: 1, padding: 0.25 }}
              minZoom={0.3}
              maxZoom={1.5}
              zoomOnScroll={false}
              preventScrolling={false}
              nodesDraggable={!disabled}
              nodesConnectable={!disabled}
              elementsSelectable
              onNodeClick={(_, n) => select(n.id)}
              onNodesChange={(changes) => {
                if (disabled) return;
                const result = applyNodeChanges(changes, visualNodes);
                setVisualNodes(result);
                if (
                  !changes.some(
                    (c) => c.type === 'remove' || c.type === 'position'
                  )
                )
                  return;
                publish({
                  nodes: result.map((n) => ({
                    ...currentDefinition.current.nodes.find(
                      (old) => old.id === n.id
                    )!,
                    positionX: n.position.x,
                    positionY: n.position.y,
                  })),
                  edges: currentDefinition.current.edges.filter(
                    (e) =>
                      result.some((n) => n.id === e.sourceNodeId) &&
                      result.some((n) => n.id === e.targetNodeId)
                  ),
                });
              }}
              onEdgesChange={(changes) => {
                if (!disabled) {
                  const result = applyEdgeChanges(changes, visualEdges);
                  setVisualEdges(result);
                  if (!changes.some((c) => c.type === 'remove')) return;
                  publish({
                    ...currentDefinition.current,
                    edges: result.map((e) => ({
                      id: e.id,
                      sourceNodeId: e.source,
                      targetNodeId: e.target,
                      sourceHandle: e.sourceHandle || undefined,
                    })),
                  });
                }
              }}
              onConnect={(edge) => {
                if (!disabled && edge.source && edge.target)
                  publish({
                    ...definition,
                    edges: [
                      ...definition.edges,
                      {
                        id: crypto.randomUUID(),
                        sourceNodeId: edge.source,
                        targetNodeId: edge.target,
                        sourceHandle: edge.sourceHandle || undefined,
                      },
                    ],
                  });
              }}
            >
              <Background />
              <Controls
                showInteractive={false}
                fitViewOptions={{ maxZoom: 1, padding: 0.25 }}
              />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
        {node && (
          <div className="w-full lg:w-[300px] lg:shrink-0 border-t lg:border-t-0 lg:border-l border-newTableBorder p-4 overflow-y-auto max-h-[600px] space-y-4">
            <fieldset disabled={disabled} className="space-y-4">
              <h3>{t(labels[node.type], node.type)}</h3>
              {['TRIGGER', 'CONDITION'].includes(node.type) && (
                <>
                  <label>
                    {t('trigger_keywords', 'Palavras-chave')}
                    <CommaSeparatedKeywordsInput
                      className={input}
                      keywords={cfg.keywords || []}
                      onKeywordsChange={(keywords) => update({ keywords })}
                    />
                  </label>
                  <select
                    className={input}
                    aria-label={t(
                      'shared_match_mode',
                      'Correspondência das palavras'
                    )}
                    value={cfg.matchMode || 'any'}
                    onChange={(e) => update({ matchMode: e.target.value })}
                  >
                    {['any', 'all', 'exact'].map((mode) => (
                      <option key={mode} value={mode}>
                        {t(`match_${mode}`, mode)}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {messenger && node.type === 'TRIGGER' && (
                <MessengerPriority
                  disabled={disabled}
                  value={cfg.priority}
                  onChange={(priority) => update({ priority })}
                />
              )}
              {node.type === 'REPLY_COMMENT' && (
                <SharedReplyVariations
                  disabled={disabled}
                  messages={cfg.messages || [cfg.message || '']}
                  onChange={(messages) =>
                    update({ message: undefined, messages })
                  }
                />
              )}
              {node.type === 'SEND_DM' && (
                <label>
                  {t('shared_message', 'Mensagem privada')}
                  <textarea
                    rows={8}
                    maxLength={cfg.buttonText ? 640 : 2000}
                    className={input}
                    value={cfg.message || ''}
                    onChange={(e) =>
                      update({
                        message: e.target.value,
                      })
                    }
                  />
                </label>
              )}
              {node.type === 'SEND_DM' && (
                <>
                  <label>
                    {t('shared_button_text', 'Texto do botão (opcional)')}
                    <input
                      className={input}
                      maxLength={20}
                      value={cfg.buttonText || ''}
                      onChange={(e) => update({ buttonText: e.target.value })}
                    />
                  </label>
                  <label>
                    {t('shared_button_url', 'Link HTTPS do botão')}
                    <input
                      className={input}
                      value={cfg.buttonUrl || ''}
                      onChange={(e) => update({ buttonUrl: e.target.value })}
                    />
                  </label>
                </>
              )}
              {node.type === 'DELAY' && (
                <>
                  <label>
                    {t('shared_wait_seconds', 'Espera em segundos')}
                    <input
                      type="number"
                      min={0}
                      max={86400}
                      className={input}
                      value={
                        (cfg.duration || 0) *
                        (cfg.unit === 'hours'
                          ? 3600
                          : cfg.unit === 'minutes'
                          ? 60
                          : 1)
                      }
                      onChange={(e) =>
                        update({
                          duration: Number(e.target.value),
                          unit: 'seconds',
                        })
                      }
                    />
                  </label>
                </>
              )}
            </fieldset>
            <button
              type="button"
              className="border border-newTableBorder rounded-lg px-3 py-2 text-sm disabled:opacity-40"
              onClick={() => select(null)}
            >
              {t('close', 'Fechar')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
