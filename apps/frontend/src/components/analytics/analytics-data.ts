import type { AnalyticsData } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import type { TotalList } from './stars.and.forks.interface';

export type NumericAnalytics = Omit<AnalyticsData, 'data'> & {
  data: TotalList[];
  average?: boolean;
};
const invalid = (): never => {
  throw new Error('INVALID_ANALYTICS_DATA');
};
function numeric(value: unknown): number {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    (typeof value === 'string' && !value.trim())
  )
    return invalid();
  const result = Number(value);
  return Number.isFinite(result) ? result : invalid();
}
export function normalizeAnalyticsPoints(raw: unknown): TotalList[] {
  if (!Array.isArray(raw)) return invalid();
  return raw.map((point) => {
    if (!point || typeof point !== 'object' || typeof point.date !== 'string')
      return invalid();
    return { total: numeric(point.total), date: point.date };
  });
}
export function analyticsTotal(
  series: Pick<NumericAnalytics, 'data' | 'average'>
): number | null {
  if (!series.data.length) return null;
  const sum = series.data.reduce((total, point) => total + point.total, 0);
  if (!Number.isFinite(sum)) return invalid();
  return series.average ? sum / series.data.length : sum;
}
export function normalizeAnalytics(raw: unknown): NumericAnalytics[] {
  if (!Array.isArray(raw)) return invalid();
  return raw.map((series) => {
    if (
      !series ||
      typeof series.label !== 'string' ||
      (series.average !== undefined && typeof series.average !== 'boolean')
    )
      return invalid();
    const item: NumericAnalytics = {
      label: series.label,
      data: normalizeAnalyticsPoints(series.data),
      ...(series.average !== undefined ? { average: series.average } : {}),
      ...(series.percentageChange !== undefined
        ? { percentageChange: numeric(series.percentageChange) }
        : {}),
    };
    analyticsTotal(item);
    return item;
  });
}
export function formatAnalyticsTotal(series: NumericAnalytics): string {
  const total = analyticsTotal(series);
  if (total === null) return '—';
  return series.average
    ? `${total.toFixed(2)}%`
    : new Intl.NumberFormat().format(Math.round(total));
}
export function mergeAnalyticsPoints(
  raw: unknown,
  count: number,
  average = false
): TotalList[] {
  const data = normalizeAnalyticsPoints(raw);
  if (!data.length) return [];
  const size = Math.max(1, Math.ceil(data.length / Math.max(1, count)));
  const merged: TotalList[] = [];
  for (let index = 0; index < data.length; index += size) {
    const points = data.slice(index, index + size);
    merged.push({
      date: `${points[0].date} - ${points.at(-1)!.date}`,
      total: analyticsTotal({ data: points, average })!,
    });
  }
  return merged;
}
