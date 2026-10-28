import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AutomationStatusSwitch } from './shared-editor-status.component';
import { AutomationPreviewPanel } from './shared-editor-preview.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
afterEach(cleanup);
const props = {
  status: 'DRAFT' as const,
  busy: false,
  valid: true,
  onChange: vi.fn(),
};
describe('controle de status junto da previa', () => {
  it('ativa por acao explicita e mantem estado confirmado ate resposta', () => {
    render(<AutomationStatusSwitch {...props} />);
    const control = screen.getByRole('switch', { name: 'activate_flow' });
    expect(control.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(control);
    expect(props.onChange).toHaveBeenCalledWith('ACTIVE');
    expect(control.getAttribute('aria-checked')).toBe('false');
  });
  it('permite pausar mesmo com edicao invalida sem solicitar save', () => {
    render(<AutomationStatusSwitch {...props} status="ACTIVE" valid={false} />);
    const control = screen.getByRole('switch', { name: 'pause_flow' });
    expect(control).toHaveProperty('disabled', false);
    fireEvent.click(control);
    expect(props.onChange).toHaveBeenCalledWith('PAUSED');
  });
  it('bloqueia ativacao invalida e regra arquivada', () => {
    const view = render(<AutomationStatusSwitch {...props} valid={false} />);
    expect(screen.getByRole('switch')).toHaveProperty('disabled', true);
    view.rerender(<AutomationStatusSwitch {...props} status="ARCHIVED" />);
    expect(screen.getByRole('switch')).toHaveProperty('disabled', true);
  });
  it('mostra progresso da ativacao e bloqueia repeticao', () => {
    render(<AutomationStatusSwitch {...props} busy pendingAction="activate" />);
    expect(screen.getByText('automation_activating')).toBeTruthy();
    expect(screen.getByRole('switch')).toHaveProperty('disabled', true);
  });
  it('recupera controle desligado apos falha de ativacao', () => {
    const view = render(
      <AutomationStatusSwitch {...props} busy pendingAction="activate" />
    );
    view.rerender(<AutomationStatusSwitch {...props} />);
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe(
      'false'
    );
    expect(screen.getByRole('switch')).toHaveProperty('disabled', false);
  });
  it('fica dentro da previa sem depender do conteudo do telefone', () => {
    render(
      <AutomationPreviewPanel controls={<AutomationStatusSwitch {...props} />}>
        Telefone
      </AutomationPreviewPanel>
    );
    expect(
      screen
        .getByRole('complementary', { name: 'shared_preview' })
        .contains(screen.getByRole('switch'))
    ).toBe(true);
    expect(screen.getByText('Telefone')).toBeTruthy();
  });
});
