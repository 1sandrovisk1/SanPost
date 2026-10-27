import { afterEach, describe, expect, it } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { FacebookHelp } from './facebook-help.component';

afterEach(cleanup);
describe('ajuda contextual Facebook', () => {
  it('abre por toque sem enviar formulario e fecha com Escape mantendo o foco', async () => {
    let submitted = false;
    render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submitted = true;
        }}
      >
        <FacebookHelp
          label="Ajuda do aplicativo"
          text="Um aplicativo pode atender varias Paginas."
        />
      </form>
    );
    const button = screen.getByRole('button', { name: 'Ajuda do aplicativo' });
    act(() => button.focus());
    fireEvent.click(button);
    const tooltip = await screen.findByRole('tooltip');
    await waitFor(() =>
      expect(tooltip.classList.contains('react-tooltip__show')).toBe(true)
    );
    await waitFor(() =>
      expect(button.getAttribute('aria-expanded')).toBe('true')
    );
    expect(submitted).toBe(false);
    fireEvent.keyDown(button, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(document.activeElement).toBe(button);
  });
  it('fecha ao clicar fora sem bloquear a outra acao', async () => {
    let clicked = false;
    render(
      <>
        <FacebookHelp label="Ajuda da URL" text="Copie esta URL." />
        <button
          onClick={() => {
            clicked = true;
          }}
        >
          Outra acao
        </button>
      </>
    );
    const button = screen.getByRole('button', { name: 'Ajuda da URL' });
    fireEvent.click(button);
    const tooltip = await screen.findByRole('tooltip');
    await waitFor(() =>
      expect(tooltip.classList.contains('react-tooltip__show')).toBe(true)
    );
    await waitFor(() =>
      expect(button.getAttribute('aria-expanded')).toBe('true')
    );
    fireEvent.click(screen.getByRole('button', { name: 'Outra acao' }));
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    expect(clicked).toBe(true);
  });
});
