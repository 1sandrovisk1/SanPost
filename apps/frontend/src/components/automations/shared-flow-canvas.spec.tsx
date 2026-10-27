import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useState } from 'react';
import { SharedFlowCanvas } from './shared-flow-canvas.component';
import { simpleDefinition } from '@gitroom/nestjs-libraries/database/prisma/flows-v2/flow-definition';
const state = vi.hoisted(() => ({ props: {} as any, edits: vi.fn() }));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
vi.mock('@xyflow/react', async (original) => ({
  ...(await original<any>()),
  ReactFlow: (props: any) => {
    state.props = props;
    return <div />;
  },
  ReactFlowProvider: ({ children }: any) => children,
}));
afterEach(() => {
  cleanup();
  state.edits.mockClear();
});
function mount(
  graph = simpleDefinition({ message: 'Oi', reply: 'Original' }),
  channels: any[] = []
) {
  function Editor() {
    const [definition, setDefinition] = useState(graph);
    return (
      <SharedFlowCanvas
        definition={definition}
        channels={channels}
        disabled={false}
        onChange={(value) => {
          state.edits(value);
          setDefinition(value);
        }}
      />
    );
  }
  return render(<Editor />);
}
describe('canvas compartilhado', () => {
  it('Messenger edita prioridade no gatilho e remove resposta publica da paleta', () => {
    mount(
      simpleDefinition({
        triggerType: 'messenger_message',
        priority: 10,
        keywords: ['link'],
        message: 'Oi',
      })
    );
    expect(screen.queryByRole('button', { name: 'node_reply' })).toBeNull();
    act(() => state.props.onNodeClick(null, { id: 'trigger' }));
    fireEvent.change(screen.getByLabelText('messenger_priority'), {
      target: { value: '3' },
    });
    expect(
      JSON.parse(state.edits.mock.lastCall![0].nodes[0].data)
    ).toMatchObject({
      triggerType: 'messenger_message',
      priority: 3,
      keywords: ['link'],
    });
  });
  it('projeta canais e posts apenas na apresentacao e nao captura a roda da pagina', () => {
    const channels = [
      {
        platform: 'facebook',
        name: 'Pagina',
        postMode: 'specific',
        postIds: ['p1'],
      },
    ];
    mount(undefined, channels);
    expect(state.props.nodes[0].data.channels).toEqual(channels);
    expect(JSON.parse(state.props.nodes[0].data.config)).not.toHaveProperty(
      'channels'
    );
    expect(state.props.zoomOnScroll).toBe(false);
    expect(state.props.preventScrolling).toBe(false);
    expect(state.props.fitViewOptions.maxZoom).toBe(1);
  });
  it('preserva selecao sem marcar alteracao e remove somente a aresta selecionada', () => {
    mount();
    fireEvent.click(document.body); // flush the initial projection
    const edge = state.props.edges[0].id;
    const Trigger = () => (
      <button
        onClick={() =>
          state.props.onEdgesChange([
            { type: 'select', id: edge, selected: true },
          ])
        }
      >
        select
      </button>
    );
    render(<Trigger />);
    fireEvent.click(screen.getByText('select'));
    expect(state.props.edges[0].selected).toBe(true);
    expect(state.edits).not.toHaveBeenCalled();
    render(
      <button
        onClick={() =>
          state.props.onEdgesChange([{ type: 'remove', id: edge }])
        }
      >
        remove
      </button>
    );
    fireEvent.click(screen.getByText('remove'));
    expect(state.edits.mock.lastCall![0].edges).toHaveLength(1);
  });
  it('converte minutos para segundos e edita a resposta que sera enviada', () => {
    const graph = simpleDefinition({ message: 'Oi', reply: 'Original' });
    graph.nodes[1].data = JSON.stringify({ messages: ['Variante', 'Outra'] });
    graph.nodes.push({
      id: 'wait',
      type: 'DELAY',
      data: '{"duration":2,"unit":"minutes"}',
      positionX: 0,
      positionY: 0,
    });
    mount(graph);
    render(
      <>
        <button onClick={() => state.props.onNodeClick(null, { id: 'wait' })}>
          wait
        </button>
        <button onClick={() => state.props.onNodeClick(null, { id: 'reply' })}>
          reply
        </button>
      </>
    );
    fireEvent.click(screen.getByText('wait'));
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe(
      '120'
    );
    fireEvent.change(screen.getByRole('spinbutton'), {
      target: { value: '180' },
    });
    expect(
      JSON.parse(
        state.edits.mock.lastCall![0].nodes.find((n: any) => n.id === 'wait')
          .data
      )
    ).toEqual({ duration: 180, unit: 'seconds' });
    fireEvent.click(screen.getByText('reply'));
    expect(
      (screen.getByLabelText('shared_public_reply') as HTMLTextAreaElement)
        .value
    ).toBe('Variante');
    fireEvent.change(screen.getByLabelText('shared_public_reply'), {
      target: { value: 'Atualizada' },
    });
    expect(
      JSON.parse(
        state.edits.mock.lastCall![0].nodes.find((n: any) => n.id === 'reply')
          .data
      ).messages
    ).toEqual(['Atualizada', 'Outra']);
    fireEvent.change(screen.getByLabelText('shared_reply_variant 2'), {
      target: { value: 'Outra atualizada' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'shared_reply_remove 1' })
    );
    const updated = JSON.parse(
      state.edits.mock.lastCall![0].nodes.find((n: any) => n.id === 'reply')
        .data
    );
    expect(updated).toEqual({ messages: ['Outra atualizada'] });
  });
  it('compoe exclusao simultanea de no e aresta independente', () => {
    mount();
    act(() => {
      state.props.onEdgesChange([
        { type: 'remove', id: state.props.edges[0].id },
      ]);
      state.props.onNodesChange([{ type: 'remove', id: 'dm' }]);
    });
    expect(state.edits.mock.lastCall![0].nodes.map((n: any) => n.id)).toEqual([
      'trigger',
      'reply',
    ]);
    expect(state.edits.mock.lastCall![0].edges).toEqual([]);
  });
});
