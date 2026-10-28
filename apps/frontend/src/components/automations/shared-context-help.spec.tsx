import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AutomationContextHelp } from './shared-context-help.component';
afterEach(cleanup);
describe('ajuda sem deslocar o layout', () => {
  it('abre em portal por hover e fecha com Escape sem adicionar conteudo na linha', () => {
    const view = render(
      <div data-testid="line">
        Etapas
        <AutomationContextHelp label="Ajuda">Conteudo</AutomationContextHelp>
      </div>
    );
    const trigger = screen.getByRole('button', { name: 'Ajuda' });
    fireEvent.mouseEnter(trigger);
    const tooltip = screen.getByRole('tooltip');
    expect(screen.getByTestId('line').contains(tooltip)).toBe(false);
    expect(tooltip.style.position).toBe('fixed');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    expect(view.container.querySelector('details')).toBeNull();
  });
  it('suporta foco clique persistente e dismiss externo', () => {
    render(
      <>
        <button>Outro</button>
        <AutomationContextHelp label="Ajuda">Conteudo</AutomationContextHelp>
      </>
    );
    const button = screen.getByRole('button', { name: 'Ajuda' });
    fireEvent.focus(button);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.click(button);
    fireEvent.mouseLeave(button);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.pointerDown(screen.getByText('Outro'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
it('mantem ajuda na camada do dialog e consome Escape', () => {
  render(
    <dialog open>
      <div>
        <AutomationContextHelp label="Ajuda">Conteudo</AutomationContextHelp>
      </div>
    </dialog>
  );
  fireEvent.click(screen.getByRole('button', { name: 'Ajuda' }));
  expect(screen.getByRole('tooltip').closest('dialog')).toBeTruthy();
  const escape = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(escape);
  expect(escape.defaultPrevented).toBe(true);
});
