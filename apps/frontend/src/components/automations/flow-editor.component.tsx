'use client';
import { useFlowTheme } from './shared-flow-theme';

import {
  FC,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  DragEvent,
} from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Node,
  Edge,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useFlow } from '@gitroom/frontend/components/automations/hooks/use-flows';
import { TriggerNode } from '@gitroom/frontend/components/automations/nodes/trigger-node';
import { ConditionNode } from '@gitroom/frontend/components/automations/nodes/condition-node';
import { ReplyCommentNode } from '@gitroom/frontend/components/automations/nodes/reply-comment-node';
import { SendDmNode } from '@gitroom/frontend/components/automations/nodes/send-dm-node';
import { DelayNode } from '@gitroom/frontend/components/automations/nodes/delay-node';
import { DeletableEdge } from '@gitroom/frontend/components/automations/nodes/deletable-edge';
import { NodeConfigPanel } from '@gitroom/frontend/components/automations/node-config-panel';
import { FlowExecutionsComponent } from '@gitroom/frontend/components/automations/flow-executions.component';
import { AutomationWorkspace } from './shared-workspace.component';
import type { WorkspaceNavigation } from './shared-workspace-navigation';
import { useEditorDirty } from './shared-editor-dirty';
import { usePreventWindowUnload } from '@gitroom/react/helpers/use.prevent.window.unload';
import { setEditorStatus, type EditorRecord } from './shared-editor-actions';
import type { EditorPendingAction } from './shared-editor-footer.component';
import { LoadingComponent } from '@gitroom/frontend/components/layout/loading';
import { useToaster } from '@gitroom/react/toaster/toaster';

const nodeTypes = {
  trigger: TriggerNode,
  condition: ConditionNode,
  replyComment: ReplyCommentNode,
  sendDm: SendDmNode,
  delay: DelayNode,
};

const edgeTypes = {
  deletable: DeletableEdge,
};

const defaultEdgeOptions = { type: 'deletable' };

const NODE_TYPE_MAP: Record<string, string> = {
  TRIGGER: 'trigger',
  CONDITION: 'condition',
  REPLY_COMMENT: 'replyComment',
  SEND_DM: 'sendDm',
  DELAY: 'delay',
};

const REVERSE_NODE_TYPE_MAP: Record<string, string> = {
  trigger: 'TRIGGER',
  condition: 'CONDITION',
  replyComment: 'REPLY_COMMENT',
  sendDm: 'SEND_DM',
  delay: 'DELAY',
};

const NODE_TOOLBAR_CONFIG = [
  {
    type: 'trigger',
    color: 'var(--automation-trigger)',
    labelKey: 'node_trigger',
    label: 'Trigger',
    descKey: 'node_trigger_desc',
    desc: 'Instagram comment',
  },
  {
    type: 'condition',
    color: 'var(--automation-condition)',
    labelKey: 'node_condition',
    label: 'Condition',
    descKey: 'node_condition_desc',
    desc: 'Filter by keywords',
  },
  {
    type: 'replyComment',
    color: 'var(--automation-comment)',
    labelKey: 'node_reply',
    label: 'Reply Comment',
    descKey: 'node_reply_desc',
    desc: 'Public reply',
  },
  {
    type: 'sendDm',
    color: 'var(--automation-dm)',
    labelKey: 'node_dm',
    label: 'Send DM',
    descKey: 'node_dm_desc',
    desc: 'Private message',
  },
  {
    type: 'delay',
    color: 'var(--automation-delay)',
    labelKey: 'node_delay',
    label: 'Delay',
    descKey: 'node_delay_desc',
    desc: 'Wait before next',
  },
];

interface FlowEditorProps {
  id: string;
  workspace?: WorkspaceNavigation;
}

const FlowEditorInner: FC<FlowEditorProps> = ({ id, workspace }) => {
  const colorMode = useFlowTheme();
  const t = useT();
  const { screenToFlowPosition } = useReactFlow();
  const fetchApi = useFetch();
  const toaster = useToaster();
  const { data: flow, isLoading, mutate } = useFlow(id);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [saving, setSaving] = useState(false);
  const [flowName, setFlowName] = useState(flow?.name || '');
  const [hydrated, setHydrated] = useState(false);
  const [panelDirty, setPanelDirty] = useState(false);
  usePreventWindowUnload(panelDirty);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] =
    useState<EditorPendingAction>('save');
  const record = useRef<EditorRecord | undefined>(flow);
  const pendingConfirmation = useRef<
    { signature: string; version?: string } | undefined
  >(undefined);

  const initialNodes = useMemo(() => {
    if (!flow?.nodes) return [];
    return flow.nodes.map((n: any) => ({
      id: n.id,
      type: NODE_TYPE_MAP[n.type] || 'trigger',
      position: { x: n.positionX, y: n.positionY },
      data: { label: n.label, config: n.data },
    }));
  }, [flow?.nodes]);

  const initialEdges = useMemo(() => {
    if (!flow?.edges) return [];
    return flow.edges.map((e: any) => ({
      id: e.id,
      source: e.sourceNodeId,
      target: e.targetNodeId,
      sourceHandle: e.sourceHandle || undefined,
      type: 'deletable',
    }));
  }, [flow?.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const signature = JSON.stringify({
    name: flowName,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
    })),
  });
  const { dirty, markSaved, resetBaseline } = useEditorDirty(
    signature,
    hydrated
  );
  // Sync nodes/edges when flow data first arrives (initialNodes/initialEdges are empty on first render)
  useEffect(() => {
    if (
      !flow?.id ||
      dirty ||
      panelDirty ||
      pendingConfirmation.current ||
      workspace?.switching
    )
      return;
    if (
      hydrated &&
      (!flow.updatedAt ||
        new Date(flow.updatedAt).getTime() <=
          new Date(record.current?.updatedAt || '').getTime())
    )
      return;
    resetBaseline();
    record.current = flow;
    setFlowName(flow.name || '');
    setHydrated(true);
    setNodes(
      (flow.nodes ?? []).map((n: any) => ({
        id: n.id,
        type: NODE_TYPE_MAP[n.type] || 'trigger',
        position: { x: n.positionX, y: n.positionY },
        data: { label: n.label, config: n.data },
      }))
    );
    setEdges(
      (flow.edges ?? []).map((e: any) => ({
        id: e.id,
        source: e.sourceNodeId,
        target: e.targetNodeId,
        sourceHandle: e.sourceHandle || undefined,
        type: 'deletable',
      }))
    );
  }, [
    flow?.id,
    flow?.updatedAt,
    dirty,
    panelDirty,
    hydrated,
    resetBaseline,
    setNodes,
    setEdges,
    workspace?.switching,
  ]);

  const warnPanel = useCallback(() => {
    setActionError(t('automation_workspace_apply_node'));
  }, [t]);
  const onConnect = useCallback(
    (params: Connection) => {
      // Block DM → DM direct connection (Meta only allows 1 private reply per comment)
      const sourceNode = nodes.find((n) => n.id === params.source);
      const targetNode = nodes.find((n) => n.id === params.target);
      if (sourceNode?.type === 'sendDm' && targetNode?.type === 'sendDm') {
        toaster.show(
          t(
            'dm_single_limit',
            'A Meta permite apenas 1 mensagem direta por comentario. Use quebras de linha no campo de mensagem para enviar multiplas linhas.'
          ),
          'warning'
        );
        return;
      }
      setEdges((eds) => addEdge(params, eds));
    },
    [setEdges, nodes, toaster, t]
  );

  const onNodeClick = useCallback(
    (_: any, node: Node) => {
      if (panelDirty) {
        warnPanel();
        return;
      }
      setSelectedNode(node);
    },
    [panelDirty, warnPanel]
  );

  const onPaneClick = useCallback(() => {
    if (panelDirty) {
      warnPanel();
      return;
    }
    setSelectedNode(null);
  }, [panelDirty, warnPanel]);

  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const position = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNodeId = `temp-${Date.now()}`;
      const newNode: Node = {
        id: newNodeId,
        type,
        position,
        data: { label: type, config: '{}' },
      };

      setNodes((nds) => {
        // Find last added node (highest Y, or last in array) to auto-connect
        const lastNode = nds.length > 0 ? nds[nds.length - 1] : null;
        const shouldAutoConnect =
          lastNode &&
          type !== 'trigger' &&
          // Block DM → DM auto-connect (Meta 1 private reply limit)
          !(lastNode.type === 'sendDm' && type === 'sendDm');

        if (shouldAutoConnect) {
          const edgeData: Edge = {
            id: `e-${lastNode.id}-${newNodeId}`,
            source: lastNode.id,
            target: newNodeId,
            type: 'deletable',
          };
          // Condition nodes need sourceHandle to identify match/no_match path
          if (lastNode.type === 'condition') {
            edgeData.sourceHandle = 'match';
          }
          setEdges((eds) => [...eds, edgeData]);
        }

        if (lastNode?.type === 'sendDm' && type === 'sendDm') {
          toaster.show(
            t(
              'dm_single_limit',
              'A Meta permite apenas 1 mensagem direta por comentario. Use quebras de linha no campo de mensagem para enviar multiplas linhas.'
            ),
            'warning'
          );
        }

        return [...nds, newNode];
      });
    },
    [setNodes, setEdges]
  );

  const onDragStart = useCallback((event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleAddNode = useCallback(
    (type: string) => {
      setNodes((nds) => {
        const lastNode = nds.length > 0 ? nds[nds.length - 1] : null;
        const position = lastNode
          ? { x: lastNode.position.x, y: lastNode.position.y + 150 }
          : { x: 250, y: 50 };

        const newNodeId = `temp-${Date.now()}`;
        const newNode: Node = {
          id: newNodeId,
          type,
          position,
          data: { label: type, config: '{}' },
        };

        const shouldAutoConnect =
          lastNode &&
          type !== 'trigger' &&
          !(lastNode.type === 'sendDm' && type === 'sendDm');

        if (shouldAutoConnect) {
          const edgeData: Edge = {
            id: `e-${lastNode.id}-${newNodeId}`,
            source: lastNode.id,
            target: newNodeId,
            type: 'deletable',
          };
          if (lastNode.type === 'condition') {
            edgeData.sourceHandle = 'match';
          }
          setEdges((eds) => [...eds, edgeData]);
        }

        if (lastNode?.type === 'sendDm' && type === 'sendDm') {
          toaster.show(
            t(
              'dm_single_limit',
              'A Meta permite apenas 1 mensagem direta por comentario. Use quebras de linha no campo de mensagem para enviar multiplas linhas.'
            ),
            'warning'
          );
        }

        return [...nds, newNode];
      });
    },
    [setNodes, setEdges, toaster, t, screenToFlowPosition]
  );

  const handleNodeUpdate = useCallback(
    (nodeId: string, config: Record<string, any>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, config: JSON.stringify(config) } }
            : n
        )
      );
      setPanelDirty(false);
      setActionError(null);
      setSelectedNode(null);
    },
    [setNodes]
  );

  const handleSave = useCallback(async () => {
    if (saving || panelDirty || !flowName.trim()) return;
    setSaving(true);
    setPendingAction('save');
    setActionError(null);
    try {
      const canvasNodes = nodes.map((n) => {
        const rawData =
          typeof n.data?.config === 'string'
            ? n.data.config
            : JSON.stringify(n.data?.config || {});
        const backendType = REVERSE_NODE_TYPE_MAP[n.type || 'trigger'];
        // For TRIGGER nodes, derive the label from the trigger type in the
        // config JSON so webhook filters stay in sync. Other node types keep
        // whatever label the user assigned (or none).
        let label =
          typeof n.data?.label === 'string' ? n.data.label : undefined;
        if (backendType === 'TRIGGER') {
          try {
            const parsed = JSON.parse(rawData);
            label =
              parsed?.triggerType === 'story_reply'
                ? 'story_reply'
                : 'comment_on_post';
          } catch {
            label = 'comment_on_post';
          }
        }
        return {
          id: n.id,
          type: backendType,
          label,
          data: rawData,
          positionX: n.position.x,
          positionY: n.position.y,
        };
      });

      const canvasEdges = edges.map((e) => ({
        id: e.id,
        sourceNodeId: e.source,
        targetNodeId: e.target,
        sourceHandle: e.sourceHandle || undefined,
      }));

      if (!pendingConfirmation.current) {
        const baseVersion = record.current?.updatedAt;
        const res = await fetchApi(`/flows/${id}/canvas`, {
          method: 'PUT',
          body: JSON.stringify({
            nodes: canvasNodes,
            edges: canvasEdges,
            name: flowName.trim(),
            expectedUpdatedAt: baseVersion,
          }),
        });
        if (!res.ok) throw new Error('save');
        pendingConfirmation.current = { signature, version: baseVersion };
      }
      const pending = pendingConfirmation.current;
      const fresh = await mutate();
      if (
        fresh?.id !== id ||
        !fresh.updatedAt ||
        (pending.version &&
          new Date(fresh.updatedAt).getTime() <=
            new Date(pending.version).getTime())
      )
        throw new Error('confirmation');
      record.current = fresh;
      markSaved(pending.signature);
      pendingConfirmation.current = undefined;
      toaster.show(t('flow_saved', 'Automacao salva'), 'success');
    } catch {
      setActionError(
        t(
          pendingConfirmation.current
            ? 'automation_workspace_saved_refresh_failed'
            : 'failed_to_save_flow'
        )
      );
    } finally {
      setSaving(false);
    }
  }, [
    nodes,
    edges,
    id,
    fetchApi,
    mutate,
    t,
    toaster,
    saving,
    panelDirty,
    flowName,
    signature,
    markSaved,
  ]);
  const handleStatusChange = async (target: 'ACTIVE' | 'PAUSED') => {
    if (saving || !record.current) return;
    if (
      target === 'ACTIVE' &&
      (dirty || panelDirty || !!pendingConfirmation.current)
    ) {
      setActionError(t('automation_workspace_save_activate'));
      return;
    }
    setSaving(true);
    setPendingAction(target === 'ACTIVE' ? 'activate' : 'pause');
    setActionError(null);
    try {
      await setEditorStatus(
        fetchApi,
        'instagram',
        record.current,
        target,
        (updated) => {
          record.current = updated;
        }
      );
      const fresh = await mutate();
      if (
        fresh?.id &&
        (!record.current?.updatedAt ||
          new Date(fresh.updatedAt).getTime() >=
            new Date(record.current.updatedAt).getTime())
      )
        record.current = fresh;
    } catch {
      setActionError(t('failed_to_change_status'));
    } finally {
      setSaving(false);
    }
  };

  const trigger = nodes.find((node) => node.type === 'trigger');
  let storyTrigger = trigger?.data?.label === 'story_reply';
  try {
    storyTrigger ||=
      JSON.parse(String(trigger?.data?.config || '{}')).triggerType ===
      'story_reply';
  } catch {
    /* Malformed config stays available in the canvas. */
  }
  if (isLoading) return <LoadingComponent />;
  if (!flow)
    return (
      <div className="p-[24px] text-textColor">
        {t('flow_not_found', 'Flow not found')}
      </div>
    );

  return (
    <AutomationWorkspace
      picture={flow.integration?.picture || undefined}
      name={flowName}
      nameLabel={t('flow_name')}
      onNameChange={setFlowName}
      subtitle={[
        flow.integration?.name || t('flow_account_missing'),
        t(
          storyTrigger
            ? 'automation_name_instagram_story'
            : 'automation_instagram_comment_type'
        ),
      ].join(' · ')}
      status={record.current?.status || flow.status || 'DRAFT'}
      dirty={dirty || panelDirty || !!pendingConfirmation.current}
      busy={saving}
      pendingAction={pendingAction}
      valid={
        !!flowName.trim() &&
        !panelDirty &&
        nodes.some((n) => n.type === 'trigger')
      }
      problems={
        panelDirty
          ? [t('automation_workspace_apply_node')]
          : !flowName.trim()
          ? [t('automation_name_required')]
          : []
      }
      impact={t('automation_save_impact_instagram')}
      error={actionError}
      onSave={() => void handleSave()}
      onStatusChange={(next) => void handleStatusChange(next)}
      navigation={workspace}
      history={<FlowExecutionsComponent flowId={id} />}
    >
      <div className="flex flex-col flex-1 min-h-[500px] lg:min-h-0">
        {/* Node palette */}
        <fieldset
          disabled={
            saving || workspace?.switching || flow.status === 'ARCHIVED'
          }
          className="flex items-center gap-[8px] border-b border-fifth bg-newBgColorInner px-[16px] py-[8px] overflow-x-auto"
        >
          <span className="text-xs text-newTextColor/60 shrink-0">
            {t('automation_add_step')}
          </span>
          {NODE_TOOLBAR_CONFIG.map((item) => (
            <button
              type="button"
              disabled={
                saving || workspace?.switching || flow.status === 'ARCHIVED'
              }
              key={item.type}
              draggable={
                !saving && !workspace?.switching && flow.status !== 'ARCHIVED'
              }
              onDragStart={(e) => onDragStart(e, item.type)}
              onClick={() => {
                if (
                  !saving &&
                  !workspace?.switching &&
                  flow.status !== 'ARCHIVED'
                )
                  handleAddNode(item.type);
              }}
              className="cursor-grab flex items-center gap-[8px] rounded-[6px] px-[10px] py-[6px] text-textColor bg-btnSimple border border-fifth hover:bg-boxHover min-w-fit"
              style={{ borderLeftWidth: 3, borderLeftColor: item.color }}
            >
              <div>
                <div className="text-[12px] font-medium leading-tight">
                  {t(item.labelKey, item.label)}
                </div>
                <div className="text-[10px] text-customColor18 leading-tight">
                  {t(item.descKey, item.desc)}
                </div>
              </div>
            </button>
          ))}
        </fieldset>

        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
          {selectedNode && (
            <NodeConfigPanel
              node={selectedNode}
              flowId={id}
              integrationId={flow?.integrationId || ''}
              onUpdate={handleNodeUpdate}
              onClose={onPaneClick}
              onDirtyChange={setPanelDirty}
              disabled={
                saving || workspace?.switching || flow.status === 'ARCHIVED'
              }
            />
          )}
          {/* Canvas */}
          <div className="flex-1 min-w-0 relative min-h-[500px] lg:min-h-0">
            <ReactFlow
              colorMode={colorMode}
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onDragOver={onDragOver}
              onDrop={onDrop}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              deleteKeyCode={['Backspace', 'Delete']}
              nodesDraggable={
                !saving && !workspace?.switching && flow.status !== 'ARCHIVED'
              }
              nodesConnectable={
                !saving && !workspace?.switching && flow.status !== 'ARCHIVED'
              }
              elementsSelectable={!saving}
              fitView
              style={{ background: 'var(--new-bgColor)' }}
            >
              <Background color="var(--new-bgLineColor)" gap={20} />
              <Controls />
              <MiniMap
                nodeColor={(n) => {
                  switch (n.type) {
                    case 'trigger':
                      return 'var(--automation-trigger)';
                    case 'condition':
                      return 'var(--automation-condition)';
                    case 'replyComment':
                      return 'var(--automation-comment)';
                    case 'sendDm':
                      return 'var(--automation-dm)';
                    case 'delay':
                      return 'var(--automation-delay)';
                    default:
                      return '#999';
                  }
                }}
              />
            </ReactFlow>
          </div>
        </div>
      </div>
    </AutomationWorkspace>
  );
};

export const FlowEditorComponent: FC<FlowEditorProps> = ({ id, workspace }) => {
  return (
    <ReactFlowProvider>
      <FlowEditorInner id={id} workspace={workspace} />
    </ReactFlowProvider>
  );
};
