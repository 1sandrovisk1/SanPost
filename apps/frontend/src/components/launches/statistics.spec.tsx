import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { StatisticsModal } from './statistics';
const { fetchApi } = vi.hoisted(() => ({ fetchApi: vi.fn() }));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => fetchApi,
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback || key,
}));
vi.mock('@gitroom/frontend/components/analytics/chart-social', () => ({
  ChartSocial: ({ data }: any) => (
    <div data-testid="chart">{JSON.stringify(data)}</div>
  ),
}));
vi.mock('@gitroom/react/form/select', () => ({
  Select: ({ children, value, onChange }: any) => (
    <select value={value} onChange={onChange}>
      {children}
    </select>
  ),
}));
vi.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => <div>Loading</div>,
}));
vi.mock('@gitroom/frontend/components/launches/missing-release.modal', () => ({
  MissingReleaseModal: () => <div>Missing release</div>,
}));
const wrapper = ({ children }: any) => (
  <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
    {children}
  </SWRConfig>
);
const emptyStatistics = { clicks: [] as Array<{ short: string; original: string; clicks: number }> };
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('estatisticas da publicacao', () => {
  it('normaliza a mesma serie usada no card e no grafico', async () => {
    fetchApi.mockImplementation(async (path: string) => ({
      ok: true,
      json: async () =>
        path.includes('/analytics/')
          ? [
              {
                label: 'Views',
                data: ['12', '34', '5'].map((total) => ({
                  total,
                  date: 'day',
                })),
              },
            ]
          : emptyStatistics,
    }));
    render(<StatisticsModal postId="post" />, { wrapper });
    await screen.findByText('51');
    expect(screen.getByTestId('chart').textContent).toContain('"total":34');
  });
  it('mantem o tratamento de publicacao sem ID remoto', async () => {
    fetchApi.mockImplementation(async (path: string) => ({
      ok: true,
      json: async () =>
        path.includes('/analytics/') ? { missing: true } : emptyStatistics,
    }));
    render(<StatisticsModal postId="missing" />, { wrapper });
    await screen.findByText('Missing release');
    expect(screen.queryByTestId('chart')).toBeNull();
  });
  it('erro de analytics oferece nova consulta sem tratar como zero', async () => {
    fetchApi.mockImplementation(async (path: string) => ({
      ok: !path.includes('/analytics/'),
      json: async () =>
        path.includes('/analytics/')
          ? { message: 'Forbidden' }
          : emptyStatistics,
    }));
    render(<StatisticsModal postId="failed" />, { wrapper });
    await screen.findByRole('alert');
    fetchApi.mockResolvedValue({
      ok: true,
      json: async () => [
        { label: 'Views', data: [{ total: '7', date: 'day' }] },
      ],
    });
    fireEvent.click(screen.getByRole('button'));
    await screen.findByText('7');
  });
});
