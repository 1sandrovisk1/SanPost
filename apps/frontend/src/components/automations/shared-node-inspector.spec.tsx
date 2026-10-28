import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NodeConfigPanel } from './node-config-panel';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
vi.mock('swr', () => ({ default: () => ({}) }));
const state = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => state.fetch,
}));
afterEach(cleanup);
describe('aplicacao local do inspetor', () => {
  it('distingue aplicar de salvar e so publica o rascunho quando solicitado', () => {
    const onUpdate = vi.fn(),
      onDirtyChange = vi.fn();
    render(
      <NodeConfigPanel
        node={{
          id: 'dm',
          type: 'sendDm',
          data: {
            config:
              '{"message":"Oi","buttonText":"Abrir","buttonUrl":"https://example.com"}',
          },
        }}
        flowId="flow"
        integrationId="ig"
        onUpdate={onUpdate}
        onClose={vi.fn()}
        onDirtyChange={onDirtyChange}
      />
    );
    expect(
      screen.getByRole('complementary', { name: 'node_config' })
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'save_config' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'automation_apply_node' })
    ).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByLabelText('shared_message'), {
      target: { value: 'Mensagem nova' },
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_apply_node' })
    );
    expect(onUpdate).toHaveBeenCalledWith('dm', {
      message: 'Mensagem nova',
      messages: undefined,
      buttonText: 'Abrir',
      buttonUrl: 'https://example.com',
    });
    expect(state.fetch).not.toHaveBeenCalled();
  });
});
vi.mock('./ad-aliases-field.component', () => ({
  AdAliasesField: () => <span>IDs vinculados</span>,
}));
vi.mock('./hooks/use-unmatched-comments', () => ({
  useAliases: () => ({ data: [{ id: 'alias' }] }),
}));
vi.mock('./shared-publication-selector.component', () => ({
  AutomationPublicationSelector: ({
    specificContent,
    scopeNote,
    mode,
  }: any) => (
    <section aria-label="Selecionar publicacoes">
      {mode === 'specific' ? specificContent : scopeNote}
    </section>
  ),
}));
it('agrupa aliases em especificas tambem no inspetor do construtor', () => {
  render(
    <NodeConfigPanel
      node={{
        id: 't',
        type: 'trigger',
        data: { config: '{"mode":"specific"}' },
      }}
      flowId="f"
      integrationId="ig"
      onUpdate={vi.fn()}
      onClose={vi.fn()}
    />
  );
  expect(
    screen
      .getByRole('region', { name: 'Selecionar publicacoes' })
      .contains(screen.getByText('IDs vinculados'))
  ).toBe(true);
});
it.each([
  ['', 3],
  ['99', 10],
  ['2.5', 2],
  ['-1', 1],
])(
  'normaliza tentativas do gate no inspetor ao aplicar %s',
  (input, expected) => {
    const update = vi.fn();
    render(
      <NodeConfigPanel
        node={{
          id: 'trigger',
          type: 'trigger',
          data: {
            config: JSON.stringify({ requireFollow: true, maxGateAttempts: 4 }),
          },
        }}
        flowId="f"
        integrationId="ig"
        onUpdate={update}
        onClose={vi.fn()}
      />
    );
    fireEvent.click(screen.getByText('automation_gate_attempts'));
    fireEvent.change(screen.getByLabelText('follow_gate_max_attempts_label'), {
      target: { value: input },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_apply_node' })
    );
    expect(update).toHaveBeenCalledWith(
      'trigger',
      expect.objectContaining({ maxGateAttempts: expected })
    );
  }
);
