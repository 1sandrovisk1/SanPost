import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AutomationEditorFooter } from './shared-editor-footer.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
afterEach(cleanup);
const props = {
  status: 'DRAFT' as const,
  dirty: true,
  busy: false,
  valid: true,
  onSave: vi.fn(),
};
describe('rodape exclusivamente de salvamento', () => {
  it('mostra pendencia e impede salvar configuracao invalida', () => {
    render(
      <AutomationEditorFooter
        {...props}
        valid={false}
        problems={['Falta mensagem']}
      />
    );
    expect(screen.getByRole('button', { name: 'save_flow' })).toHaveProperty(
      'disabled',
      true
    );
    expect(screen.getByText('Falta mensagem')).toBeTruthy();
  });
  it.each(['DRAFT', 'PAUSED', 'ACTIVE'] as const)(
    'oferece somente salvar no status %s',
    (status) => {
      render(<AutomationEditorFooter {...props} status={status} />);
      expect(screen.getAllByRole('button')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'save_flow' }));
      expect(props.onSave).toHaveBeenCalled();
    }
  );
  it('nao regrava uma regra sem alteracoes', () => {
    render(<AutomationEditorFooter {...props} status="ACTIVE" dirty={false} />);
    expect(screen.getByRole('button', { name: 'save_flow' })).toHaveProperty(
      'disabled',
      true
    );
  });
  it('preserva o impacto ao lado da acao de salvar', () => {
    render(
      <AutomationEditorFooter
        {...props}
        status="ACTIVE"
        impact="Impacto no envio pendente"
      />
    );
    expect(screen.getByText('Impacto no envio pendente')).toBeTruthy();
  });
  it('mantem progresso de salvar e bloqueia cliques repetidos', () => {
    render(<AutomationEditorFooter {...props} busy pendingAction="save" />);
    expect(screen.getByRole('button', { name: 'saving_flow' })).toHaveProperty(
      'disabled',
      true
    );
  });
  it('nao exibe ativacao como se fosse salvamento e preserva erro acessivel', () => {
    render(
      <AutomationEditorFooter
        {...props}
        busy
        pendingAction="activate"
        error="Falha ao ativar"
      />
    );
    expect(screen.getByRole('button', { name: 'save_flow' })).toHaveProperty(
      'disabled',
      true
    );
    expect(screen.getByRole('alert').textContent).toBe('Falha ao ativar');
    expect(screen.queryByText('automation_activating')).toBeNull();
  });
  it('mantem pendencias adicionais recolhidas', () => {
    render(
      <AutomationEditorFooter
        {...props}
        valid={false}
        problems={['Falta conta', 'Falta publicacao', 'Falta mensagem']}
      />
    );
    expect(screen.getByText('Falta conta').closest('details')).toBeNull();
    expect(screen.getByText('Falta publicacao').closest('details')?.open).toBe(
      false
    );
  });
  it('arquivada nao oferece salvamento', () => {
    render(<AutomationEditorFooter {...props} status="ARCHIVED" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
