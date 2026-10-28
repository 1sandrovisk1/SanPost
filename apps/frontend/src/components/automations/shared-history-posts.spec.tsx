import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SharedFlowHistory } from './shared-flow-history.component';
import { SharedChannelPosts } from './shared-channel-posts.component';
const state = vi.hoisted(() => ({
  data: undefined as any,
  error: undefined as any,
  isLoading: false,
  calls: [] as any[],
  mutate: vi.fn(),
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
  useTranslationSettings: () => ({ resolvedLanguage: 'pt' }),
}));
vi.mock('./hooks/use-shared-flows', () => ({
  useSharedFlowData: (path: string, interval: number) => {
    state.calls.push([path, interval]);
    return path?.includes('readiness')
      ? { data: { ready: true } }
      : {
          data: state.data,
          error: state.error,
          isLoading: state.isLoading,
          mutate: state.mutate,
        };
  },
}));
afterEach(() => {
  cleanup();
  state.data = undefined;
  state.error = undefined;
  state.isLoading = false;
  state.calls = [];
});
describe('historico e publicacoes', () => {
  it('exibe desconhecido sem reenvio ou erro bruto e consulta enquanto montado', () => {
    state.data = {
      items: [
        {
          id: 'e',
          status: 'unknown',
          channel: 'facebook',
          trigger: 'comment_on_post',
          actorName: 'Pessoa',
          text: 'Teste',
          startedAt: '2026-10-22T18:00:00Z',
          guidance: 'outcome_unknown',
        },
      ],
      nextCursor: null,
    };
    render(<SharedFlowHistory id="flow" />);
    expect(
      screen.getByText('history_status_unknown', { selector: 'span' })
    ).toBeTruthy();
    expect(screen.queryByText('private raw error')).toBeNull();
    expect(
      screen.queryByRole('button', { name: /reenviar|retry_delivery/i })
    ).toBeNull();
    expect(state.calls).toContainEqual([
      '/automation-history/shared/flow?status=all&limit=25',
      5000,
    ]);
  });
  it('distingue carregando, vazio e erro e abre configuracao Instagram em outra aba', () => {
    state.isLoading = true;
    const props = {
      channel: {
        integrationId: 'ig',
        postMode: 'specific' as const,
        postIds: [] as string[],
      },
      provider: 'instagram',
      disabled: false,
      onChange: vi.fn(),
    };
    const { rerender } = render(<SharedChannelPosts {...props} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_select_publications' })
    );
    expect(screen.getAllByText('shared_posts_loading').length).toBeGreaterThan(
      0
    );
    state.isLoading = false;
    state.data = { posts: [] };
    rerender(<SharedChannelPosts {...props} />);
    expect(screen.getByText('shared_posts_empty')).toBeTruthy();
    state.error = new Error('failed');
    rerender(<SharedChannelPosts {...props} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByText('shared_connection_details')).toBeNull();
  });
});
