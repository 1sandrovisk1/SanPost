import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  AutomationFollowGateFields,
  JourneyPreviewControls,
} from './shared-response-controls.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
afterEach(cleanup);
const values = {
  openingDmMessage: 'Abertura',
  openingDmButtonText: 'Receber',
  followGateMessage: 'Siga',
  alreadyFollowedButtonText: 'Já segui',
  gateExhaustedMessage: 'Limite',
  maxGateAttempts: 3,
};
describe('ajustes do follow gate e controles de previa', () => {
  it('tres grupos nativos resumem configuracao sem perder campos', () => {
    const { container } = render(
      <AutomationFollowGateFields
        values={values}
        onChange={vi.fn()}
        onFocusStage={vi.fn()}
      />
    );
    expect(container.querySelectorAll('details')).toHaveLength(3);
    expect(
      screen.getByLabelText('follow_gate_opening_dm_label')
    ).toHaveProperty('value', 'Abertura');
    expect(
      screen.getByLabelText('follow_gate_max_attempts_label')
    ).toHaveProperty('value', '3');
    expect(screen.queryByText('follow_gate_warning_step_1')).toBeNull();
  });
  it('foco de cada etapa direciona a previa e editar conserva as demais configuracoes', () => {
    const focus = vi.fn(),
      change = vi.fn();
    render(
      <AutomationFollowGateFields
        values={values}
        onChange={change}
        onFocusStage={focus}
      />
    );
    fireEvent.focus(screen.getByLabelText('story_follow_gate_label'));
    expect(focus).toHaveBeenLastCalledWith('gate');
    fireEvent.change(screen.getByLabelText('follow_gate_opening_dm_label'), {
      target: { value: 'Nova abertura' },
    });
    expect(change).toHaveBeenCalledWith({ openingDmMessage: 'Nova abertura' });
  });
  it('Story nao oferece abertura ou tentativas de postback', () => {
    render(
      <JourneyPreviewControls story stage="delivery" onChange={vi.fn()} />
    );
    const options = screen.getAllByRole('option');
    expect(options.map((o) => (o as HTMLOptionElement).value)).toEqual([
      'gate',
      'delivery',
    ]);
  });
});
