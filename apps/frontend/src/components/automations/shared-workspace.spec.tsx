import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutomationWorkspace } from './shared-workspace.component';
import {
  legacyQuickCompatible,
  readWorkspaceMode,
} from './shared-workspace-navigation';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
afterEach(cleanup);
const base = {
  name: 'Regra',
  onNameChange: vi.fn(),
  nameLabel: 'Nome',
  subtitle: 'Escorpiano',
  status: 'ACTIVE' as const,
  dirty: true,
  busy: false,
  valid: true,
  onSave: vi.fn(),
  onStatusChange: vi.fn(),
};
describe('workspace da automacao', () => {
  it('centraliza nome, status, salvar e tres modos sem gravar ao trocar', () => {
    const change = vi.fn();
    render(
      <AutomationWorkspace
        {...base}
        navigation={{ mode: 'quick', onModeChange: change }}
      >
        <p>Formulario</p>
      </AutomationWorkspace>
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome' }), {
      target: { value: 'Outro' },
    });
    expect(base.onNameChange).toHaveBeenCalledWith('Outro');
    fireEvent.blur(screen.getByRole('textbox', { name: 'Nome' }));
    expect(base.onSave).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('tab', { name: 'automation_workspace_history' })
    );
    expect(change).toHaveBeenCalledWith('history');
    expect(base.onSave).not.toHaveBeenCalled();
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'save_flow' })).toHaveLength(
      1
    );
  });
  it('Historico oculta Salvar, bloqueia nome e impede ativacao que gravaria rascunho', () => {
    const change = vi.fn();
    render(
      <AutomationWorkspace
        {...base}
        status="PAUSED"
        onStatusChange={change}
        navigation={{ mode: 'history', onModeChange: vi.fn() }}
      >
        <p>Formulario</p>
      </AutomationWorkspace>
    );
    expect(screen.queryByRole('button', { name: 'save_flow' })).toBeNull();
    expect((screen.getByLabelText('Nome') as HTMLInputElement).readOnly).toBe(
      true
    );
    fireEvent.click(screen.getByRole('switch', { name: 'activate_flow' }));
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      'history_return_editor_activate'
    );
    expect(screen.getByText('history_draft_preserved')).toBeTruthy();
  });
  it('mantem o formulario montado ao consultar historico', () => {
    const props = { ...base, history: <p>Execucoes</p> };
    const { rerender } = render(
      <AutomationWorkspace
        {...props}
        navigation={{ mode: 'quick', onModeChange: vi.fn() }}
      >
        <input aria-label="Rascunho" defaultValue="Preservado" />
      </AutomationWorkspace>
    );
    const input = screen.getByLabelText('Rascunho');
    fireEvent.change(input, { target: { value: 'Editado' } });
    rerender(
      <AutomationWorkspace
        {...props}
        navigation={{ mode: 'history', onModeChange: vi.fn() }}
      >
        <input aria-label="Rascunho" defaultValue="Preservado" />
      </AutomationWorkspace>
    );
    expect((input as HTMLInputElement).value).toBe('Editado');
    expect(screen.getByText('Execucoes')).toBeTruthy();
  });
});
describe('compatibilidade do editor rapido legado', () => {
  const trigger = {
    id: 't',
    type: 'TRIGGER',
    data: '{"triggerType":"comment_on_post","mode":"all"}',
  };
  const dm = { id: 'd', type: 'SEND_DM', data: '{"message":"Ola"}' };
  const flow = {
    nodes: [trigger, dm],
    edges: [{ sourceNodeId: 't', targetNodeId: 'd' }],
  };
  it('aceita grafo linear e modo de URL antigo', () => {
    expect(legacyQuickCompatible(flow)).toBe(true);
    expect(readWorkspaceMode(new URLSearchParams('tab=history'))).toBe(
      'history'
    );
  });
  it.each([
    { matchReactions: true, compatible: false },
    { matchReactions: undefined, compatible: false },
    { matchReactions: false, compatible: true },
  ])(
    'preserva Story com palavras-chave e reacoes $matchReactions no editor capaz de representa-lo',
    ({ matchReactions, compatible }) => {
      expect(
        legacyQuickCompatible({
          ...flow,
          nodes: [
            {
              ...trigger,
              data: JSON.stringify({
                triggerType: 'story_reply',
                mode: 'all',
                keywords: ['❤️'],
                matchReactions,
              }),
            },
            dm,
          ],
        })
      ).toBe(compatible);
    }
  );
  it('recusa ramos, nos extras e configuracoes nao representadas', () => {
    expect(
      legacyQuickCompatible({
        ...flow,
        nodes: [...flow.nodes, { id: 'x', type: 'DELAY', data: '{}' }],
      })
    ).toBe(false);
    expect(
      legacyQuickCompatible({
        ...flow,
        edges: [
          ...flow.edges,
          { sourceNodeId: 't', targetNodeId: 'd', sourceHandle: 'yes' },
        ],
      })
    ).toBe(false);
    expect(
      legacyQuickCompatible({
        ...flow,
        nodes: [
          trigger,
          { ...dm, data: '{"message":"Ola","extraAction":true}' },
        ],
      })
    ).toBe(false);
  });
});
