import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import {
  SettingsHelpButton,
  SettingsHelpDrawer,
} from './settings-help.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(cleanup);
it('separa instrucoes e diagnostico e oferece navegacao por teclado', () => {
  render(
    <SettingsHelpDrawer
      id="guide"
      network="Instagram"
      onClose={vi.fn()}
      guide={<p>Instructions</p>}
      diagnostics={<p>Stored check</p>}
    />
  );
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('Instructions')).toBeTruthy();
  expect(within(dialog).queryByText('Stored check')).toBeNull();
  fireEvent.keyDown(
    within(dialog).getByRole('tab', { name: 'meta_help_guide' }),
    { key: 'ArrowRight' }
  );
  expect(within(dialog).getByText('Stored check')).toBeTruthy();
  expect(within(dialog).queryByText('Instructions')).toBeNull();
  expect(document.activeElement).toBe(
    within(dialog).getByRole('tab', { name: 'meta_help_diagnostics' })
  );
});
it('identifica a ajuda com texto, icone e estado acessivel', () => {
  const open = vi.fn();
  render(<SettingsHelpButton open={false} drawerId="guide" onClick={open} />);
  const button = screen.getByRole('button', { name: 'meta_help' });
  expect(button.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  expect(button.getAttribute('aria-haspopup')).toBe('dialog');
  fireEvent.click(button);
  expect(open).toHaveBeenCalledOnce();
});
