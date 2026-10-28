import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { AutomationConnectionIndicator } from './shared-connection-indicator.component';
import { AutomationAccountSelect } from './shared-account-select.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (k: string) => k,
}));
vi.mock('./hooks/use-shared-flows', () => ({ useSharedFlowData: () => ({}) }));
afterEach(cleanup);
it('mostra alerta e ajuda funcional no link de uma conta indisponivel mesmo com select bloqueado', () => {
  render(
    <fieldset disabled>
      <AutomationAccountSelect
        label="Conta"
        value="a"
        disabled
        accounts={[{ id: 'a', name: 'Runzos' }]}
        onChange={vi.fn()}
        connection={
          <AutomationConnectionIndicator
            ready={false}
            provider="facebook"
            integrationId="a"
          />
        }
      />
    </fieldset>
  );
  const link = screen.getByRole('link', {
    name: 'automation_connection_settings',
  });
  expect(link.getAttribute('target')).toBe('_blank');
  expect(link.getAttribute('href')).toContain('facebookAutomation=a');
  expect(link.querySelector('svg')?.getAttribute('data-status')).toBe(
    'warning'
  );
  fireEvent.mouseEnter(link);
  expect(screen.getByRole('tooltip').textContent).toContain(
    'automation_connection_action_hint'
  );
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('tooltip')).toBeNull();
  fireEvent.focus(link);
  expect(screen.getByRole('tooltip')).toBeTruthy();
});
