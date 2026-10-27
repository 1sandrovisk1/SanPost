import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StyleGuide } from './style-guide.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, options?: Record<string, string>) =>
    options?.action ? `${key}: ${options.action}` : key,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('catalogo visual isolado', () => {
  it('alterna a previa sem alterar o tema global', () => {
    const before = document.body.className;
    render(<StyleGuide />);
    fireEvent.click(screen.getByRole('button', { name: 'ui_guide_dark' }));
    expect(
      screen
        .getByRole('button', { name: 'ui_guide_dark' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(
      screen
        .getByRole('button', { name: 'ui_guide_light' })
        .getAttribute('aria-pressed')
    ).toBe('false');
    expect(document.body.className).toBe(before);
  });
  it('exemplos de aprovar e excluir geram apenas feedback local', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<StyleGuide />);
    fireEvent.click(screen.getByRole('button', { name: 'ui_guide_approve' }));
    expect(screen.getByRole('status').textContent).toContain(
      'ui_guide_simulated: ui_guide_approve'
    );
    fireEvent.click(screen.getByRole('button', { name: 'ui_guide_delete' }));
    expect(screen.getByRole('status').textContent).toContain(
      'ui_guide_simulated: ui_guide_delete'
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
