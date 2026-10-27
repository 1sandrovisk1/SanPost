import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MetaCopyField } from './meta-copy-field.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
afterEach(cleanup);
describe('copiar dados Meta', () => {
  it('informa erro de clipboard sem confirmar uma copia falsa', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(Error('SECRET')) },
    });
    render(<MetaCopyField label="Token" value="secret" secret />);
    fireEvent.click(screen.getByRole('button', { name: 'fb_auto_copy' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'meta_copy_error'
    );
    expect(screen.queryByText('SECRET')).toBeNull();
    expect(screen.queryByText('fb_auto_copied')).toBeNull();
  });
  it('mantem o token oculto e limpa a confirmacao quando muda o valor', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: copy },
    });
    const { rerender } = render(
      <MetaCopyField label="Token" value="secret" secret />
    );
    expect(screen.getByLabelText('Token').getAttribute('type')).toBe(
      'password'
    );
    fireEvent.click(screen.getByRole('button', { name: 'fb_auto_copy' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'fb_auto_copied' })
      ).toBeTruthy()
    );
    rerender(<MetaCopyField label="Token" value="new" secret />);
    expect(screen.getByRole('button', { name: 'fb_auto_copy' })).toBeTruthy();
  });
});
