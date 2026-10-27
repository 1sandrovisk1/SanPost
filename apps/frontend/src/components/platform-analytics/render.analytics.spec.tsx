import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  render,
  screen,
  fireEvent,
  waitFor,
} from '@testing-library/react';
import { SWRConfig } from 'swr';
import { RenderAnalytics } from './render.analytics';
const { fetchApi } = vi.hoisted(() => ({ fetchApi: vi.fn() }));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => fetchApi,
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback?: string) => fallback || key,
}));
vi.mock('@gitroom/frontend/components/layout/loading', () => ({
  LoadingComponent: () => <div role="status">Loading</div>,
}));
vi.mock('@gitroom/frontend/components/analytics/chart-social', () => ({
  ChartSocial: ({ data }: any) => (
    <div data-testid="chart">{JSON.stringify(data)}</div>
  ),
}));
const wrapper = ({ children }: any) => (
  <SWRConfig
    value={{
      provider: () => new Map(),
      shouldRetryOnError: false,
      dedupingInterval: 0,
    }}
  >
    {children}
  </SWRConfig>
);
const series = (values: Array<string | number>) => [
  {
    label: 'Media views',
    data: values.map((total) => ({ total, date: 'day' })),
  },
];
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('metricas da conta', () => {
  it('mostra soma e grafico numericos para a resposta real do contrato', async () => {
    fetchApi.mockResolvedValue({
      ok: true,
      json: async () => series(['12', '34', '5']),
    });
    render(
      <RenderAnalytics integration={{ id: 'account' } as any} date={7} />,
      { wrapper }
    );
    await screen.findByText('51');
    expect(screen.getByTestId('chart').textContent).toContain('"total":34');
    expect(screen.queryByText('5.0%')).toBeNull();
    expect(fetchApi).toHaveBeenCalledWith('/analytics/account?date=7');
  });
  it('aguarda o JSON antes de retirar o carregamento', async () => {
    let finish: (data: unknown) => void;
    fetchApi.mockResolvedValue({
      ok: true,
      json: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    render(
      <RenderAnalytics integration={{ id: 'pending' } as any} date={7} />,
      { wrapper }
    );
    await waitFor(() => expect(fetchApi).toHaveBeenCalled());
    expect(screen.getByRole('status')).toBeTruthy();
    finish!(series(['2', '3']));
    await screen.findByText('5');
  });
  it('exibe erro e permite repetir consulta sem iniciar OAuth', async () => {
    fetchApi.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Forbidden' }),
    });
    render(<RenderAnalytics integration={{ id: 'failed' } as any} date={7} />, {
      wrapper,
    });
    await screen.findByRole('alert');
    fetchApi.mockResolvedValue({ ok: true, json: async () => series(['4']) });
    fireEvent.click(screen.getByRole('button'));
    await screen.findByText('4');
    expect(
      fetchApi.mock.calls.every(([path]) => path === '/analytics/failed?date=7')
    ).toBe(true);
  });
  it('trocar conta e periodo troca os valores apresentados', async () => {
    fetchApi.mockImplementation(async (path: string) => ({
      ok: true,
      json: async () =>
        series(path.includes('other?date=30') ? ['9', '5'] : ['2', '3']),
    }));
    const view = render(
      <RenderAnalytics integration={{ id: 'first' } as any} date={7} />,
      { wrapper }
    );
    await screen.findByText('5');
    view.rerender(
      <RenderAnalytics integration={{ id: 'other' } as any} date={30} />
    );
    await screen.findByText('14');
    expect(screen.getByTestId('chart').textContent).toContain('"total":9');
  });
});
