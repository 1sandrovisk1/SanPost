import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { AutomationWizardServerWrapper } from './automation-wizard-server-wrapper.component';
const state = vi.hoisted(() => ({
  flow: null as any,
  refresh: vi.fn(),
  query: '',
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.query),
}));
vi.mock('./hooks/use-flows', () => ({
  useFlow: () => ({ data: state.flow, mutate: state.refresh }),
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
vi.mock('./flow-executions.component', () => ({
  FlowExecutionsComponent: () => <p>Execucoes</p>,
}));
vi.mock('./automation-wizard.component', async () => {
  const React = await import('react');
  const { AutomationWorkspace } = await import('./shared-workspace.component');
  return {
    AutomationWizardComponent: ({ workspace, initialFlow }: any) => {
      const [name, setName] = React.useState(initialFlow.name);
      return (
        <AutomationWorkspace
          name={name}
          nameLabel="Nome"
          onNameChange={setName}
          status="PAUSED"
          dirty={name !== initialFlow.name}
          busy={false}
          valid={!workspace.readOnly}
          onSave={vi.fn()}
          onStatusChange={vi.fn()}
          navigation={workspace}
          history={<p>Execucoes</p>}
        >
          <p>Comentarios</p>
        </AutomationWorkspace>
      );
    },
  };
});
vi.mock('./story-wizard.component', () => ({
  StoryWizardComponent: () => <p>Stories</p>,
}));
vi.mock('./flow-editor.component', async () => {
  const { AutomationWorkspace } = await import('./shared-workspace.component');
  return {
    FlowEditorComponent: ({ workspace }: any) => (
      <AutomationWorkspace
        name="Canvas"
        nameLabel="Nome"
        onNameChange={vi.fn()}
        status="PAUSED"
        dirty={false}
        busy={false}
        valid
        onSave={vi.fn()}
        onStatusChange={vi.fn()}
        navigation={workspace}
      >
        <p>Canvas</p>
      </AutomationWorkspace>
    ),
  };
});
const fixture = () => ({
  id: 'flow',
  name: 'Original',
  nodes: [
    { id: 't', type: 'TRIGGER', data: '{"mode":"all"}' },
    { id: 'd', type: 'SEND_DM', data: '{"message":"Oi"}' },
  ],
  edges: [{ sourceNodeId: 't', targetNodeId: 'd' }],
});
beforeEach(() => {
  state.flow = fixture();
  state.query = '';
  state.refresh.mockReset();
  state.refresh.mockImplementation(async () => state.flow);
  window.history.replaceState(null, '', '/automations/instagram/flow');
});
afterEach(cleanup);
describe('navegacao V1 preserva rascunhos', () => {
  it('historico mantem campos e troca entre editores exige salvar', async () => {
    render(<AutomationWizardServerWrapper flowId="flow" />);
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Rascunho' },
    });
    fireEvent.click(
      screen.getByRole('tab', { name: 'automation_workspace_history' })
    );
    await screen.findByText('Execucoes');
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe(
      'Rascunho'
    );
    fireEvent.click(
      screen.getByRole('tab', { name: 'automation_workspace_flow' })
    );
    await screen.findByText('automation_workspace_dirty_guard');
    expect(screen.queryByText('Canvas')).toBeNull();
    expect(state.refresh).not.toHaveBeenCalled();
  });
  it('protege a troca pela URL e voltar do navegador', async () => {
    const { rerender } = render(
      <AutomationWizardServerWrapper flowId="flow" />
    );
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Rascunho' },
    });
    state.query = 'view=flow';
    rerender(<AutomationWizardServerWrapper flowId="flow" />);
    await screen.findByText('automation_workspace_dirty_guard');
    window.history.replaceState(null, '', '?view=flow');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await waitFor(() => expect(window.location.search).toBe('?view=quick'));
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe(
      'Rascunho'
    );
  });
  it('revalida antes de trocar limpo e bloqueia campos durante a consulta', async () => {
    let resolve!: (flow: any) => void;
    state.refresh.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        })
    );
    render(<AutomationWizardServerWrapper flowId="flow" />);
    fireEvent.click(
      screen.getByRole('tab', { name: 'automation_workspace_flow' })
    );
    expect((screen.getByLabelText('Nome') as HTMLInputElement).disabled).toBe(
      true
    );
    resolve(state.flow);
    await screen.findByText('Canvas');
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(window.location.search).toBe('?view=flow');
  });
  it('grafo avancado direto nao abre rapido e atualizacao remota nao elimina edicao', async () => {
    const { rerender } = render(
      <AutomationWizardServerWrapper flowId="flow" />
    );
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Rascunho' },
    });
    state.flow = {
      ...fixture(),
      nodes: [...fixture().nodes, { id: 'x', type: 'DELAY', data: '{}' }],
    };
    rerender(<AutomationWizardServerWrapper flowId="flow" />);
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe(
      'Rascunho'
    );
    expect(
      (screen.getByRole('button', { name: 'save_flow' }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
    cleanup();
    state.query = 'view=quick';
    render(<AutomationWizardServerWrapper flowId="flow" />);
    expect(screen.getByText('Canvas')).toBeTruthy();
    expect(screen.queryByText('Comentarios')).toBeNull();
  });
  it('mudanca remota de gatilho compativel preserva o tipo do editor com rascunho', () => {
    const { rerender } = render(
      <AutomationWizardServerWrapper flowId="flow" />
    );
    fireEvent.change(screen.getByLabelText('Nome'), {
      target: { value: 'Rascunho' },
    });
    state.flow = {
      ...fixture(),
      nodes: [
        {
          id: 't',
          type: 'TRIGGER',
          data: '{"triggerType":"story_reply","mode":"all"}',
        },
        fixture().nodes[1],
      ],
    };
    rerender(<AutomationWizardServerWrapper flowId="flow" />);
    expect(screen.getByText('Comentarios')).toBeTruthy();
    expect((screen.getByLabelText('Nome') as HTMLInputElement).value).toBe(
      'Rascunho'
    );
  });
});
