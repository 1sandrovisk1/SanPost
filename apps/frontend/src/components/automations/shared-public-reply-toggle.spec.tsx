import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AutomationPublicReplyToggle } from './shared-public-reply-toggle.component';
afterEach(cleanup);
describe('resposta publica agrupada', () => {
  it('agrupa campos habilitados no mesmo box e esconde sem perder estado externo', () => {
    const { rerender } = render(
      <AutomationPublicReplyToggle
        label="Resposta publica"
        enabled
        onChange={() => {}}
      >
        <input aria-label="Variacao" />
      </AutomationPublicReplyToggle>
    );
    expect(
      screen
        .getByRole('group', { name: 'Resposta publica' })
        .contains(screen.getByLabelText('Variacao'))
    ).toBe(true);
    expect(
      screen.getByRole('group', { name: 'Resposta publica' }).className
    ).not.toContain('bg-boxHover');
    expect(
      screen.getByRole('group', { name: 'Resposta publica' }).className
    ).not.toContain('border');
    rerender(
      <AutomationPublicReplyToggle
        label="Resposta publica"
        enabled={false}
        onChange={() => {}}
      >
        <input aria-label="Variacao" />
      </AutomationPublicReplyToggle>
    );
    expect(screen.queryByLabelText('Variacao')).toBeNull();
  });
});
