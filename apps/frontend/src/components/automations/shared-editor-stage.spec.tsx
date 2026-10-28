import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { AutomationEditorStage } from './shared-editor-stage.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (k: string) => k,
}));
afterEach(cleanup);
it('agrupa uma etapa e recolhe sem desmontar nem perder valor', () => {
  render(
    <AutomationEditorStage
      kind="private"
      step={5}
      title="Mensagem privada"
      summary="2 variacoes"
    >
      <input aria-label="Texto" defaultValue="Original" />
    </AutomationEditorStage>
  );
  const toggle = screen.getByRole('button', { name: 'Mensagem privada' });
  expect(toggle.getAttribute('aria-expanded')).toBe('true');
  fireEvent.change(screen.getByLabelText('Texto'), {
    target: { value: 'Editada' },
  });
  fireEvent.click(toggle);
  expect(toggle.getAttribute('aria-expanded')).toBe('false');
  expect(document.querySelector('input')?.value).toBe('Editada');
  fireEvent.click(toggle);
  expect((screen.getByLabelText('Texto') as HTMLInputElement).value).toBe(
    'Editada'
  );
  expect(
    screen.getByRole('region', { name: 'Mensagem privada' }).className
  ).toContain('border-l-4');
});
