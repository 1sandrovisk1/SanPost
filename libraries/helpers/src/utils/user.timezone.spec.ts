import { afterEach, describe, expect, it } from 'vitest';
import {
  fromUtc,
  getTimezone,
  isTimezone,
  newDayjs,
  setUserTimezone,
  toPickerDate,
} from './user.timezone';

afterEach(() => setUserTimezone(null));

describe('fuso do usuario', () => {
  it('valida nomes IANA e rejeita texto desconhecido', () => {
    expect(isTimezone('America/Sao_Paulo')).toBe(true);
    expect(isTimezone('Mars/Olympus')).toBe(false);
    expect(isTimezone('')).toBe(false);
  });

  it('mostra meia-noite em Sao Paulo sem alterar o instante UTC', () => {
    setUserTimezone('America/Sao_Paulo');
    const date = fromUtc('2026-10-30T03:15:00Z');
    expect(getTimezone()).toBe('America/Sao_Paulo');
    expect(date.format('YYYY-MM-DD HH:mm')).toBe('2026-10-30 00:15');
    expect(date.utc().toISOString()).toBe('2026-10-30T03:15:00.000Z');
  });

  it('interpreta horario do editor no fuso escolhido e o envia em UTC', () => {
    setUserTimezone('America/Sao_Paulo');
    expect(newDayjs('2026-10-30T00:15:00').utc().toISOString()).toBe(
      '2026-10-30T03:15:00.000Z'
    );
  });

  it('avanca o horario inexistente no inicio do horario de verao', () => {
    setUserTimezone('America/New_York');
    const date = newDayjs('2026-03-08T02:30:00');
    expect(date.format('YYYY-MM-DD HH:mm')).toBe('2026-03-08 03:30');
    expect(date.utc().toISOString()).toBe('2026-03-08T07:30:00.000Z');
  });

  it('escolhe o primeiro instante ao digitar uma hora repetida', () => {
    setUserTimezone('America/New_York');
    expect(newDayjs('2026-11-01T01:30:00').utc().toISOString()).toBe(
      '2026-11-01T05:30:00.000Z'
    );
  });

  it('preserva o segundo instante de hora repetida que veio da API', () => {
    setUserTimezone('America/New_York');
    const date = fromUtc('2026-11-01T06:30:00Z');
    expect(date.format('HH:mm')).toBe('01:30');
    expect(date.clone().utc().toISOString()).toBe('2026-11-01T06:30:00.000Z');
    expect(date.valueOf()).toBe(Date.parse('2026-11-01T06:30:00Z'));
  });

  it('somar um dia preserva a hora local atraves da transicao DST', () => {
    setUserTimezone('America/New_York');
    const before = newDayjs('2026-03-07T12:00:00');
    const after = before.add(1, 'day');
    expect(after.format('YYYY-MM-DD HH:mm')).toBe('2026-03-08 12:00');
    expect(after.utc().toISOString()).toBe('2026-03-08T16:00:00.000Z');
    expect(after.valueOf() - before.valueOf()).toBe(23 * 60 * 60 * 1000);
  });

  it('mudar a preferencia muda a exibicao sem reagendar o post', () => {
    const instant = '2026-10-30T03:15:00Z';
    setUserTimezone('America/Sao_Paulo');
    const saoPaulo = fromUtc(instant);
    setUserTimezone('Asia/Tokyo');
    const tokyo = fromUtc(instant);
    expect(tokyo.format('HH:mm')).toBe('12:15');
    expect(saoPaulo.valueOf()).toBe(tokyo.valueOf());
    expect(saoPaulo.format('HH:mm')).toBe('00:15');
  });

  it('entrega ao seletor nativo os componentes locais visiveis', () => {
    setUserTimezone('Asia/Tokyo');
    const picker = toPickerDate(fromUtc('2026-10-30T03:15:00Z'));
    expect([
      picker.getFullYear(),
      picker.getMonth(),
      picker.getDate(),
      picker.getHours(),
      picker.getMinutes(),
    ]).toEqual([2026, 9, 30, 12, 15]);
  });
});
