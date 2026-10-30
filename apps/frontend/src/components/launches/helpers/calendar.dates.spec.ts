import { afterEach, describe, expect, it } from 'vitest';
import { setUserTimezone } from '@gitroom/helpers/utils/user.timezone';
import { calendarMonthStart, calendarSlotDate } from './calendar.dates';
afterEach(() => setUserTimezone(null));
describe('datas do calendario no fuso do usuario', () => {
  it.each(['America/Sao_Paulo', 'America/New_York', 'Asia/Tokyo'])(
    'inicia no primeiro dia local do mes em %s',
    (zone) => {
      setUserTimezone(zone);
      expect(calendarMonthStart('2026-11-15').format('YYYY-MM-DD HH:mm')).toBe(
        '2026-11-01 00:00'
      );
    }
  );
  it('slot UTC que cruza meia-noite continua no dia local escolhido', () => {
    setUserTimezone('America/Sao_Paulo');
    const slot = calendarSlotDate('2026-10-30', 0)!;
    expect(slot.format('YYYY-MM-DD HH:mm')).toBe('2026-10-30 21:00');
    expect(slot.utc().toISOString()).toBe('2026-10-31T00:00:00.000Z');
  });
  it('slot de Toquio usa o dia UTC anterior', () => {
    setUserTimezone('Asia/Tokyo');
    const slot = calendarSlotDate('2026-10-30', 15 * 60)!;
    expect(slot.format('YYYY-MM-DD HH:mm')).toBe('2026-10-30 00:00');
    expect(slot.utc().toISOString()).toBe('2026-10-29T15:00:00.000Z');
  });
  it('omite slot UTC que nao ocorre no dia local de 23 horas', () => {
    setUserTimezone('America/New_York');
    expect(calendarSlotDate('2026-03-08', 270)).toBeNull();
  });

  it('na hora repetida dois slots distintos preservam o instante', () => {
    setUserTimezone('America/New_York');
    const first = calendarSlotDate('2026-11-01', 330)!,
      second = calendarSlotDate('2026-11-01', 390)!;
    expect(first.format('HH:mm')).toBe('01:30');
    expect(second.format('HH:mm')).toBe('01:30');
    expect(second.valueOf() - first.valueOf()).toBe(3600000);
  });
});
