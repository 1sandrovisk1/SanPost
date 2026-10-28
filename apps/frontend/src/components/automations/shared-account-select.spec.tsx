import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutomationAccountSelect } from './shared-account-select.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (k: string) => k,
}));
afterEach(cleanup);
describe('conta compacta', () => {
  it('mostra avatar selecionado e indicador junto do seletor', () => {
    render(
      <AutomationAccountSelect
        label="Conta"
        value="a"
        accounts={[{ id: 'a', name: 'Pagina', picture: '/avatar.png' }]}
        connection={
          <a href="/settings" aria-label="Configurar">
            !
          </a>
        }
        onChange={() => {}}
      />
    );
    expect(
      screen
        .getByRole('combobox')
        .parentElement?.querySelector('img')
        ?.getAttribute('src')
    ).toBe('/avatar.png');
    expect(
      screen
        .getByRole('combobox')
        .parentElement?.contains(screen.getByRole('link'))
    ).toBe(true);
  });
});
