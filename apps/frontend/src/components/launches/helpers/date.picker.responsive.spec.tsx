import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
vi.mock('@mantine/dates', () => ({
  Calendar: ({ onChange }: any) => (
    <button onClick={() => onChange(new Date(2026, 9, 30))}>
      Escolher dia
    </button>
  ),
  TimeInput: ({ onChange }: any) => (
    <button onClick={() => onChange(new Date(2026, 9, 30, 9, 45))}>
      Escolher hora
    </button>
  ),
}));
import { DatePickerPanel } from './date.picker';
import {
  newDayjs,
  setUserTimezone,
} from '@gitroom/helpers/utils/user.timezone';
afterEach(() => {
  cleanup();
  setUserTimezone(null);
});
describe('seletor nativo com fuso diferente', () => {
  it.each(['America/Sao_Paulo', 'America/New_York', 'Asia/Tokyo'])(
    'interpreta os componentes do seletor no fuso %s',
    (zone) => {
      setUserTimezone(zone);
      const changed = vi.fn();
      const view = render(
        <DatePickerPanel
          date={newDayjs('2026-10-29T12:15:00')}
          onChange={changed}
        />
      );
      fireEvent.click(view.getByText('Escolher dia'));
      expect(changed.mock.calls[0][0].format('YYYY-MM-DD HH:mm')).toBe(
        '2026-10-30 12:15'
      );
      fireEvent.click(view.getByText('Escolher hora'));
      expect(changed.mock.calls[1][0].format('YYYY-MM-DD HH:mm')).toBe(
        '2026-10-29 09:45'
      );
    }
  );
});
