import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { FlowEditorComponent } from './flow-editor.component';
const state = vi.hoisted(() => ({
  flow: null as any,
  fetch: vi.fn(),
  mutate: vi.fn(),
  canvas: null as any,
  position: vi.fn((p: any) => ({ x: p.x / 2, y: p.y / 2 })),
}));
vi.mock('./hooks/use-flows', () => ({
  useFlow: () => ({ data: state.flow, mutate: state.mutate }),
}));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => state.fetch,
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
vi.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: vi.fn() }),
}));
vi.mock('./flow-executions.component', () => ({
  FlowExecutionsComponent: () => <p>Historico</p>,
}));
vi.mock('./node-config-panel', () => ({
  NodeConfigPanel: ({ onDirtyChange }: any) => (
    <input aria-label="Campo do no" onChange={() => onDirtyChange(true)} />
  ),
}));
vi.mock('@xyflow/react', async () => {
  const React = await import('react');
  return {
    ReactFlow: (props: any) => {
      state.canvas = props;
      return (
        <div data-testid="canvas">
          <button onClick={() => props.onNodeClick(null, props.nodes[0])}>
            Abrir no
          </button>
          {props.children}
        </div>
      );
    },
    ReactFlowProvider: ({ children }: any) => <>{children}</>,
    Background: (): null => null,
    Controls: (): null => null,
    MiniMap: (): null => null,
    useNodesState: (initial: any) => {
      const [nodes, setNodes] = React.useState(initial);
      return [nodes, setNodes, vi.fn()];
    },
    useEdgesState: (initial: any) => {
      const [edges, setEdges] = React.useState(initial);
      return [edges, setEdges, vi.fn()];
    },
    addEdge: vi.fn(),
    useReactFlow: () => ({ screenToFlowPosition: state.position }),
  };
});
const fixture = () => ({
  id: 'flow',
  name: 'Original',
  status: 'PAUSED',
  updatedAt: '2026-10-27T10:00:00.000Z',
  nodes: [
    {
      id: 't',
      type: 'TRIGGER',
      data: '{"mode":"all"}',
      positionX: 0,
      positionY: 0,
    },
    {
      id: 'd',
      type: 'SEND_DM',
      data: '{"message":"Oi"}',
      positionX: 0,
      positionY: 1,
    },
  ],
  edges: [{ id: 'e', sourceNodeId: 't', targetNodeId: 'd' }],
});
beforeEach(() => {
  state.flow = fixture();
  state.fetch.mockReset();
  state.mutate.mockReset();
  state.mutate.mockImplementation(async () => ({
    ...state.flow,
    updatedAt: '2026-10-27T11:00:00.000Z',
  }));
  state.fetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      ...state.flow,
      updatedAt: '2026-10-27T11:00:00.000Z',
    }),
  });
});
afterEach(cleanup);
describe('barra e rascunho do construtor legado', () => {
  it('nao renomeia no blur e salva nome e grafo juntos com versao', async () => {
    render(<FlowEditorComponent id="flow" />);
    fireEvent.change(screen.getByLabelText('flow_name'), {
      target: { value: 'Renomeada' },
    });
    fireEvent.blur(screen.getByLabelText('flow_name'));
    expect(state.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'save_flow' }));
    await waitFor(() => expect(state.fetch).toHaveBeenCalledTimes(1));
    expect(state.fetch.mock.calls[0][0]).toBe('/flows/flow/canvas');
    expect(JSON.parse(state.fetch.mock.calls[0][1].body)).toMatchObject({
      name: 'Renomeada',
      expectedUpdatedAt: '2026-10-27T10:00:00.000Z',
      nodes: fixture().nodes,
    });
  });
  it('PUT salvo e refresh falho nao regrava com versao antiga no retry', async () => {
    state.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ nodes: [] as unknown[], edges: [] as unknown[] }),
    });
    state.mutate.mockRejectedValueOnce(new Error('offline'));
    render(<FlowEditorComponent id="flow" />);
    fireEvent.change(screen.getByLabelText('flow_name'), {
      target: { value: 'Salva' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save_flow' }));
    await screen.findByText('automation_workspace_saved_refresh_failed');
    fireEvent.click(screen.getByRole('button', { name: 'save_flow' }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(2));
    expect(state.fetch).toHaveBeenCalledTimes(1);
  });
  it('adota revalidacao limpa do mesmo ID e preserva edicao local', () => {
    const { rerender } = render(<FlowEditorComponent id="flow" />);
    state.flow = {
      ...fixture(),
      name: 'Remota',
      status: 'ACTIVE',
      updatedAt: '2026-10-27T11:00:00.000Z',
    };
    rerender(<FlowEditorComponent id="flow" />);
    expect((screen.getByLabelText('flow_name') as HTMLInputElement).value).toBe(
      'Remota'
    );
    expect(screen.getByRole('switch', { name: 'pause_flow' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('flow_name'), {
      target: { value: 'Local' },
    });
    state.flow = {
      ...state.flow,
      name: 'Nova remota',
      updatedAt: '2026-10-27T12:00:00.000Z',
    };
    rerender(<FlowEditorComponent id="flow" />);
    expect((screen.getByLabelText('flow_name') as HTMLInputElement).value).toBe(
      'Local'
    );
  });
  it('configuracao de no nao aplicada participa da protecao e historico mantem o painel', async () => {
    const report = vi.fn();
    const nav = {
      mode: 'flow' as const,
      onModeChange: vi.fn(),
      onEditorState: report,
    };
    const { rerender } = render(
      <FlowEditorComponent id="flow" workspace={nav} />
    );
    fireEvent.click(screen.getByText('Abrir no'));
    fireEvent.change(screen.getByLabelText('Campo do no'), {
      target: { value: 'Local' },
    });
    expect(report).toHaveBeenLastCalledWith({ dirty: true, busy: false });
    expect(
      (screen.getByRole('button', { name: 'save_flow' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    rerender(
      <FlowEditorComponent id="flow" workspace={{ ...nav, mode: 'history' }} />
    );
    expect(
      (screen.getByLabelText('Campo do no') as HTMLInputElement).value
    ).toBe('Local');
    expect(screen.getByText('Historico')).toBeTruthy();
  });
});

// Coordinates must come from ReactFlow's viewport, including its pan/zoom and sidebar offset.
it('drop consulta a viewport e nao offsets fixos com inspetor aberto', () => {
  render(<FlowEditorComponent id="flow" />);
  fireEvent.click(screen.getByText('Abrir no'));
  const preventDefault = vi.fn();
  fireEvent.drop(screen.getByTestId('canvas')); // mocked ReactFlow does not wire a DOM handler
  act(() =>
    state.canvas.onDrop({
      preventDefault,
      clientX: 800,
      clientY: 400,
      dataTransfer: { getData: () => 'condition' },
    })
  );
  expect(state.position).toHaveBeenCalledWith({ x: 800, y: 400 });
});
