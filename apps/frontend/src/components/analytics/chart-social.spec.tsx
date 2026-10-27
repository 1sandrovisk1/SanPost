import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ChartSocial } from './chart-social';
const { chart, destroy } = vi.hoisted(() => ({
  chart: vi.fn(),
  destroy: vi.fn(),
}));
vi.mock('chart.js/auto', () => ({
  default: function (...args: any[]) {
    chart(...args);
    return { destroy };
  },
}));
vi.mock('react-use-cookie', () => ({ default: () => ['dark'] }));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  chart.mockClear();
  destroy.mockClear();
});
describe('grafico social', () => {
  it('agrupa strings numericamente e recria dados ao mudar periodo', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
    } as any);
    const view = render(
      <ChartSocial
        data={
          Array.from({ length: 14 }, () => ({ total: '2', date: 'day' })) as any
        }
      />
    );
    expect(chart.mock.calls[0][1].data.datasets[0].data).toEqual(
      Array(7).fill(4)
    );
    view.rerender(
      <ChartSocial data={[{ total: '7', date: 'new' } as any]} color="green" />
    );
    expect(destroy).toHaveBeenCalled();
    expect(chart.mock.calls.at(-1)?.[1].data.datasets[0].data).toEqual([7, 7]);
  });
  it('nao monta grafico com valor invalido', () => {
    render(<ChartSocial data={[{ total: 'oops', date: 'day' } as any]} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(chart).not.toHaveBeenCalled();
  });
});
