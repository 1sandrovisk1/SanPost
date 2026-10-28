import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import {
  AutomationExecutionHistory,
  formatHistoryDate,
} from './shared-execution-history.component';
const state = vi.hoisted(() => ({
  paths: [] as string[],
  data: null as any,
  error: null as any,
  loading: false,
  detail: null as any,
  mutate: vi.fn(),
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
  useTranslationSettings: () => ({ resolvedLanguage: 'pt' }),
}));
vi.mock('./hooks/use-shared-flows', () => ({
  useSharedFlowData: (path: string | null) => {
    if (path) state.paths.push(path);
    return {
      data: path?.includes('/e1') ? state.detail : state.data,
      error: state.error,
      isLoading: state.loading,
      mutate: state.mutate,
    };
  },
}));
const item = {
  id: 'e1',
  status: 'waiting',
  channel: 'instagram',
  trigger: 'comment_on_post',
  actorName: 'Pessoa',
  actorId: 'a',
  text: 'quero',
  accountName: 'Escorpiano',
  startedAt: '2026-10-27T10:00:00Z',
  completedAt: null as string | null,
  guidance: 'waiting_interaction',
};
beforeEach(() => {
  state.paths = [];
  state.error = null;
  state.loading = false;
  state.data = { items: [item], nextCursor: 'next' };
  state.detail = {
    ...item,
    steps: [
      {
        id: 's',
        kind: 'SEND_DM',
        status: 'completed',
        at: item.startedAt,
        message: null,
      },
    ],
    technical: {
      flowId: 'f',
      engine: 'instagram',
      integrationId: 'ig',
      revision: null,
      postId: 'post',
    },
  };
  state.mutate.mockClear();
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(cleanup);
describe('historico comum e detalhes', () => {
  it('padroniza data, situa espera como pendencia e abre drawer de etapas reais', async () => {
    render(<AutomationExecutionHistory engine="instagram" flowId="f" />);
    expect(formatHistoryDate(item.startedAt, 'pt')).toContain('27/10/2026');
    fireEvent.click(
      screen.getByRole('button', { name: /history_view_details/ })
    );
    const drawer = screen.getByRole('dialog');
    expect(
      within(drawer).getByText('history_guidance_waiting_interaction')
    ).toBeTruthy();
    expect(within(drawer).getByText('history_legacy_step_hint')).toBeTruthy();
    expect(within(drawer).queryByText('history_step_accepted')).toBeNull();
    fireEvent.click(within(drawer).getByRole('button', { name: 'close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('consulta filtro e paginas no servidor e volta a primeira ao filtrar', async () => {
    render(<AutomationExecutionHistory engine="shared" flowId="f" />);
    fireEvent.click(screen.getByRole('button', { name: 'history_next' }));
    await waitFor(() =>
      expect(state.paths.some((p) => p.includes('cursor=next'))).toBe(true)
    );
    fireEvent.change(screen.getByLabelText('history_filter_status'), {
      target: { value: 'failed' },
    });
    expect(state.paths[state.paths.length - 1]).toContain('status=failed');
    expect(state.paths[state.paths.length - 1]).not.toContain('cursor=');
    fireEvent.change(screen.getByLabelText('history_filter_period'), {
      target: { value: '7' },
    });
    expect(state.paths[state.paths.length - 1]).toContain('from=');
  });
  it('distingue erro, vazio e carregando sem expor objeto bruto', () => {
    state.loading = true;
    state.data = null;
    const { rerender } = render(
      <AutomationExecutionHistory engine="shared" flowId="f" />
    );
    expect(screen.getByRole('status')).toBeTruthy();
    state.loading = false;
    state.error = new Error('SECRET');
    rerender(<AutomationExecutionHistory engine="shared" flowId="f" />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('SECRET')).toBeNull();
    expect(screen.queryByText('history_empty')).toBeNull();
    state.error = null;
    state.data = { items: [], nextCursor: null };
    rerender(<AutomationExecutionHistory engine="shared" flowId="f" />);
    expect(screen.getByText('history_empty')).toBeTruthy();
  });
  it('Messenger usa entrada de mensagem e UNKNOWN nao oferece reenvio', () => {
    state.data = {
      items: [
        {
          ...item,
          channel: 'messenger',
          trigger: 'messenger_message',
          status: 'unknown',
          guidance: 'outcome_unknown',
        },
      ],
      nextCursor: null,
    };
    render(<AutomationExecutionHistory engine="shared" flowId="f" />);
    expect(screen.getByText('history_trigger_messenger_message')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /reenviar|retry_delivery/i })
    ).toBeNull();
  });
});

describe('historico compacto', () => {
  it('omite descricao e paginacao em pagina unica sem inventar total', () => {
    state.data.nextCursor = null;
    render(<AutomationExecutionHistory engine="shared" flowId="f" />);
    expect(screen.queryByText('history_subtitle')).toBeNull();
    expect(screen.queryByRole('button', { name: 'history_next' })).toBeNull();
    expect(screen.getByText('history_auto_refresh')).toBeTruthy();
  });
  it('mostra prioridade comprovada sem ajuda de aceite quando nao houve envio', () => {
    state.data = {
      items: [{ ...item, status: 'skipped', guidance: 'higher_priority' }],
      nextCursor: null,
    };
    state.detail = { ...state.detail, ...state.data.items[0], steps: [] };
    render(<AutomationExecutionHistory engine="shared" flowId="f" />);
    expect(screen.getByText('history_status_priority')).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: /history_view_details/ })
    );
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).queryByText('history_accepted_hint')).toBeNull();
    expect(within(drawer).getByText('history_no_steps')).toBeTruthy();
    expect(
      within(drawer).getByText('history_technical').closest('details')?.open
    ).toBe(false);
  });
});
