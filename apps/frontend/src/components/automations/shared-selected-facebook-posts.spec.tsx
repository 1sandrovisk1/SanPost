import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SWRConfig } from 'swr';
import { useSelectedFacebookPosts } from './shared-selected-facebook-posts';
const state = vi.hoisted(() => ({
  fetchApi: vi.fn(),
  user: 'user',
  profile: 'profile',
}));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => state.fetchApi,
}));
vi.mock('@gitroom/frontend/hooks/use-current-profile.hook', () => ({
  useCurrentProfile: () => ({ profile: { id: state.profile } }),
}));
vi.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ id: state.user }),
}));
const wrapper = ({ children }: any) => (
  <SWRConfig value={{ provider: () => new Map() }}>{children}</SWRConfig>
);
beforeEach(() => {
  vi.clearAllMocks();
  state.user = 'user';
  state.profile = 'profile';
  state.fetchApi.mockImplementation(async (_url, options) => ({
    ok: true,
    json: async () => ({
      post: { id: JSON.parse(options.body).reference, caption: 'Dark video' },
    }),
  }));
});
afterEach(cleanup);
describe('metadados dos posts Facebook selecionados', () => {
  it('recupera selecao sem reescrever IDs e sem loop de consultas', async () => {
    const refs = ['123_456'];
    const { result, rerender } = renderHook(
      () => useSelectedFacebookPosts('fb', refs),
      { wrapper }
    );
    await waitFor(() =>
      expect(result.current.posts).toEqual([
        { id: '123_456', caption: 'Dark video' },
      ])
    );
    rerender();
    expect(state.fetchApi).toHaveBeenCalledTimes(1);
    expect(refs).toEqual(['123_456']);
  });
  it('limita a cinco consultas automaticas e carrega o restante apenas por acao explicita', async () => {
    const { result } = renderHook(
      () =>
        useSelectedFacebookPosts(
          'fb',
          Array.from({ length: 12 }, (_, i) => `123_${i + 1}`)
        ),
      { wrapper }
    );
    await waitFor(() => expect(result.current.posts).toHaveLength(5));
    expect(state.fetchApi).toHaveBeenCalledTimes(5);
    expect(result.current.hasMore).toBe(true);
    await act(() => result.current.loadMore());
    expect(result.current.posts).toHaveLength(10);
    expect(state.fetchApi).toHaveBeenCalledTimes(10);
  });
  it('preserva sucesso parcial e nao aceita alias canonico diferente sem alterar selecao', async () => {
    state.fetchApi.mockImplementation(async (_url, options) => ({
      ok: true,
      json: async () => ({
        post: {
          id:
            JSON.parse(options.body).reference === '123_789'
              ? '123_456'
              : '123_111',
          caption: 'ok',
        },
      }),
    }));
    const { result } = renderHook(
      () => useSelectedFacebookPosts('fb', ['123_111', '123_789']),
      { wrapper }
    );
    await waitFor(() => expect(result.current.failedIds).toEqual(['123_789']));
    expect(result.current.posts.map((p) => p.id)).toEqual(['123_111']);
    state.fetchApi.mockImplementation(async () => ({
      ok: true,
      json: async () => ({ post: { id: '123_789', caption: 'retry' } }),
    }));
    await act(async () => {
      await result.current.retry();
    });
    expect(result.current.posts.map((p) => p.id)).toEqual([
      '123_111',
      '123_789',
    ]);
    expect(result.current.failedIds).toEqual([]);
    expect(state.fetchApi).toHaveBeenCalledTimes(3);
  });
  it.each(['user', 'profile', 'page', 'selection'])(
    'descarta resposta antiga ao trocar %s',
    async (change) => {
      let finish!: (value: any) => void;
      state.fetchApi.mockReturnValueOnce(
        new Promise((resolve) => {
          finish = resolve;
        })
      );
      const { result, rerender } = renderHook(
        ({ page, ids }) => useSelectedFacebookPosts(page, ids),
        { wrapper, initialProps: { page: 'fb', ids: ['123_456'] } }
      );
      await waitFor(() => expect(state.fetchApi).toHaveBeenCalledTimes(1));
      if (change === 'user') state.user = 'other';
      if (change === 'profile') state.profile = 'other';
      rerender({
        page: change === 'page' ? 'other' : 'fb',
        ids: change === 'selection' ? [] : ['123_456'],
      });
      await act(async () =>
        finish({
          ok: true,
          json: async () => ({ post: { id: '123_456', caption: 'STALE' } }),
        })
      );
      await waitFor(() =>
        expect(state.fetchApi.mock.calls[0][1].signal.aborted).toBe(true)
      );
      expect(result.current.posts.some((p) => p.caption === 'STALE')).toBe(
        false
      );
    }
  );
  it('nao consulta sem conta e aborta ao desmontar', async () => {
    const empty = renderHook(
      () => useSelectedFacebookPosts(null, ['123_456']),
      { wrapper }
    );
    expect(state.fetchApi).not.toHaveBeenCalled();
    empty.unmount();
    state.fetchApi.mockReturnValue(new Promise(() => {}));
    const view = renderHook(() => useSelectedFacebookPosts('fb', ['123_456']), {
      wrapper,
    });
    await waitFor(() => expect(state.fetchApi).toHaveBeenCalledTimes(1));
    view.unmount();
    expect(state.fetchApi.mock.calls[0][1].signal.aborted).toBe(true);
  });
});
