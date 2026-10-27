import { describe, expect, it } from 'vitest';
import {
  analyticsTotal,
  mergeAnalyticsPoints,
  normalizeAnalytics,
} from './analytics-data';

describe('valores numericos das metricas', () => {
  it('soma os textos retornados pelo Facebook em vez de concatenar', () => {
    const [series] = normalizeAnalytics([
      {
        label: 'Media views',
        data: ['12', '34', '5'].map((total) => ({ total, date: '2026-10-01' })),
      },
    ]);
    expect(analyticsTotal(series)).toBe(51);
    expect(series.data.map((p) => p.total)).toEqual([12, 34, 5]);
  });
  it('aceita numeros, decimais e zero sem arredondar antes da media', () => {
    const [series] = normalizeAnalytics([
      {
        label: 'Rate',
        average: true,
        percentageChange: -2,
        data: [0, '1.5', 3].map((total) => ({ total, date: 'day' })),
      },
    ]);
    expect(analyticsTotal(series)).toBe(1.5);
    expect(series.percentageChange).toBe(-2);
    expect(analyticsTotal({ ...series, data: [] })).toBeNull();
  });
  it.each([null, false, '', ' ', 'invalid', '1,234', Infinity, NaN])(
    'recusa valor invalido sem inventar zero: %p',
    (total) => {
      expect(() =>
        normalizeAnalytics([{ label: 'Views', data: [{ total, date: 'day' }] }])
      ).toThrow('INVALID_ANALYTICS_DATA');
    }
  );
  it('recusa erro HTTP em formato JSON e overflow de totais', () => {
    expect(() => normalizeAnalytics({ message: 'Forbidden' })).toThrow();
    const series = {
      label: 'Views',
      data: [Number.MAX_VALUE, Number.MAX_VALUE].map((total) => ({ total, date: 'day' })),
    };
    expect(() => normalizeAnalytics([series])).toThrow('INVALID_ANALYTICS_DATA');
    expect(() => analyticsTotal(series)).toThrow('INVALID_ANALYTICS_DATA');
  });
  it('agrupa numericamente os pontos usados no grafico e conserva a soma', () => {
    const points = Array.from({ length: 14 }, (_, i) => ({
      total: String(i + 1),
      date: String(i),
    }));
    const grouped = mergeAnalyticsPoints(points, 7);
    expect(grouped.map((p) => p.total)).toEqual([3, 7, 11, 15, 19, 23, 27]);
    expect(grouped.reduce((sum, p) => sum + p.total, 0)).toBe(105);
    expect(mergeAnalyticsPoints(points, 7, true)[0].total).toBe(1.5);
    expect(mergeAnalyticsPoints([], 7)).toEqual([]);
  });
});
