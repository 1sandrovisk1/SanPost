import { SWRConfig } from 'swr';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  act,
} from '@testing-library/react';
import { SharedChannelPosts } from './shared-channel-posts.component';

const state = vi.hoisted(() => ({
  fetchApi: vi.fn(),
  profileId: 'profile',
  userId: 'user',
  posts: { posts: [] as any[] },
}));
vi.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ id: state.userId }),
}));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => state.fetchApi,
}));
vi.mock('@gitroom/frontend/hooks/use-current-profile.hook', () => ({
  useCurrentProfile: () => ({ profile: { id: state.profileId } }),
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
  useTranslationSettings: () => ({ resolvedLanguage: 'pt' }),
}));
vi.mock('./hooks/use-shared-flows', () => ({
  useSharedFlowData: (path: string) => ({
    data: path?.startsWith('/automation-scheduled-posts/')
      ? { posts: [] as any[], nextCursor: null as string | null }
      : path?.includes('readiness')
      ? { ready: true }
      : state.posts,
    mutate: vi.fn(),
  }),
}));
function Harness({
  id = 'fb',
  provider = 'facebook',
  triggerType = 'comment_on_post',
  disabled = false,
  ids = [],
}: any) {
  const [value, setValue] = useState<any>({
    postMode: 'specific',
    postIds: ids,
  });
  return (
    <SharedChannelPosts
      channel={{ integrationId: id, ...value }}
      provider={provider}
      triggerType={triggerType}
      disabled={disabled}
      onChange={(c) => setValue(c)}
    />
  );
}
function locate() {
  fireEvent.change(screen.getByLabelText('fb_post_reference'), {
    target: { value: '123_456' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'fb_post_find' }));
}
beforeEach(() => {
  vi.clearAllMocks();
  state.profileId = 'profile';
  state.userId = 'user';
  state.posts = { posts: [] };
  state.fetchApi.mockResolvedValue({
    ok: true,
    json: async () => ({
      post: { id: '123_456', caption: 'Dark post fixture' },
    }),
  });
});
afterEach(cleanup);
describe('publicacao de anuncio no seletor compartilhado', () => {
  it('mostra previa antes de selecionar e impede repeticao sem enviar ou salvar', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('fb_post_lookup_title'));
    locate();
    await screen.findByText('Dark post fixture');
    expect(state.fetchApi).toHaveBeenCalledWith(
      '/flows-v2/channels/fb/resolve-post',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reference: '123_456' }),
      })
    );
    fireEvent.click(screen.getByRole('button', { name: 'fb_post_add' }));
    expect(
      screen.getByRole('button', { name: 'fb_post_added' })
    ).toHaveProperty('disabled', true);
    expect(state.fetchApi).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole('button', { name: 'Dark post fixture' })
    ).toBeTruthy();
    fireEvent.click(screen.getByText('shared_selected_count'));
    fireEvent.click(
      screen.getByRole('button', { name: 'fb_post_remove 123_456' })
    );
    expect(screen.getByRole('button', { name: 'fb_post_add' })).toHaveProperty(
      'disabled',
      false
    );
  });
  it('recarrega a miniatura ausente da galeria publicada sem mudar a selecao', async () => {
    state.fetchApi.mockResolvedValue({
      ok: true,
      json: async () => ({
        post: {
          id: '123_456',
          caption: 'Dark video restored',
          thumbnailUrl: 'https://scontent.test.fbcdn.net/video.jpg',
        },
      }),
    });
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <Harness ids={['123_456']} />
      </SWRConfig>
    );
    const post = await screen.findByRole('button', {
      name: 'Dark video restored',
    });
    expect(post.querySelector('img')?.getAttribute('src')).toBe(
      'https://scontent.test.fbcdn.net/video.jpg'
    );
    fireEvent.click(screen.getByText('shared_selected_count'));
    expect(screen.getByText('123_456')).toBeTruthy();
    expect(screen.queryByText('shared_posts_not_loaded')).toBeNull();
    expect(state.fetchApi).toHaveBeenCalledTimes(1);
  });
  it('mantem miniatura recuperada e selecao apos alternar modos sem repetir a consulta', async () => {
    state.fetchApi.mockResolvedValue({
      ok: true,
      json: async () => ({
        post: {
          id: '123_456',
          caption: 'Dark recovered',
          thumbnailUrl: 'https://scontent.test.fbcdn.net/video.jpg',
          isPublished: false,
        },
      }),
    });
    render(
      <SWRConfig value={{ provider: () => new Map() }}>
        <Harness ids={['123_456']} />
      </SWRConfig>
    );
    await screen.findByRole('button', { name: 'Dark recovered' });
    fireEvent.click(
      screen.getByRole('radio', { name: 'automation_facebook_all_posts' })
    );
    fireEvent.click(
      screen.getByRole('radio', { name: 'automation_facebook_specific_post' })
    );
    const post = await screen.findByRole('button', { name: 'Dark recovered' });
    expect(post.getAttribute('aria-pressed')).toBe('true');
    expect(post.querySelector('img')?.getAttribute('src')).toBe(
      'https://scontent.test.fbcdn.net/video.jpg'
    );
    expect(state.fetchApi).toHaveBeenCalledTimes(1);
    const radio = screen.getByRole('radio', {
      name: 'automation_facebook_specific_post',
    });
    expect(
      radio.closest('div')?.contains(screen.getByText('fb_post_lookup_title'))
    ).toBe(true);
  });
  it('mantem texto durante consulta e informa erro sem exibir resposta bruta', async () => {
    let done: (value: any) => void;
    state.fetchApi.mockReturnValue(
      new Promise((resolve) => {
        done = resolve;
      })
    );
    render(<Harness />);
    fireEvent.click(screen.getByText('fb_post_lookup_title'));
    locate();
    expect(
      screen.getByRole('button', { name: 'fb_post_finding' })
    ).toHaveProperty('disabled', true);
    done!({ ok: false, json: async () => ({ message: 'raw secret error' }) });
    await screen.findByText('fb_post_error_unavailable');
    expect(screen.queryByText('raw secret error')).toBeNull();
    expect(screen.getByRole('button', { name: 'fb_post_find' })).toHaveProperty(
      'disabled',
      false
    );
  });
  it.each(['page', 'profile', 'user', 'trigger'])(
    'descarta consulta antiga ao trocar %s',
    async (change) => {
      let done: (value: any) => void;
      state.fetchApi.mockReturnValue(
        new Promise((resolve) => {
          done = resolve;
        })
      );
      const view = render(<Harness />);
      fireEvent.click(screen.getByText('fb_post_lookup_title'));
      locate();
      if (change === 'profile') state.profileId = 'other';
      if (change === 'user') state.userId = 'other';
      view.rerender(
        <Harness
          id={change === 'page' ? 'fb2' : 'fb'}
          triggerType={
            change === 'trigger' ? 'messenger_message' : 'comment_on_post'
          }
        />
      );
      done!({
        ok: true,
        json: async () => ({
          post: { id: '123_456', caption: 'STALE RESULT' },
        }),
      });
      await waitFor(() =>
        expect(state.fetchApi.mock.calls[0][1].signal.aborted).toBe(true)
      );
      expect(screen.queryByText('STALE RESULT')).toBeNull();
    }
  );
  it('recupera o botao apos timeout sem adicionar publicacao', async () => {
    vi.useFakeTimers();
    try {
      state.fetchApi.mockImplementation(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () =>
              reject(new Error('timeout'))
            );
          })
      );
      render(<Harness />);
      fireEvent.click(screen.getByText('fb_post_lookup_title'));
      locate();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30000);
      });
      expect(screen.getByRole('alert').textContent).toBe('fb_post_error_retry');
      expect(
        screen.getByRole('button', { name: 'fb_post_find' })
      ).toHaveProperty('disabled', false);
      expect(screen.queryByRole('button', { name: 'fb_post_add' })).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
  it.each(['instagram', 'instagram-standalone'])(
    'nao muda o seletor Instagram %s',
    (provider) => {
      render(<Harness provider={provider} />);
      expect(screen.queryByText('fb_post_lookup_title')).toBeNull();
    }
  );
  it('respeita modo somente leitura e limite na previa e na grade', async () => {
    state.posts = {
      posts: [
        { id: '123_456', caption: 'Public post' },
        { id: '123_1', caption: 'Selected post' },
      ],
    };
    const view = render(<Harness disabled />);
    fireEvent.click(screen.getByText('fb_post_lookup_title'));
    expect(screen.getByLabelText('fb_post_reference')).toHaveProperty(
      'disabled',
      true
    );
    expect(screen.getByRole('button', { name: 'fb_post_find' })).toHaveProperty(
      'disabled',
      true
    );
    view.unmount();
    render(
      <Harness ids={Array.from({ length: 100 }, (_, i) => `123_${i + 1}`)} />
    );
    expect(screen.getByRole('button', { name: 'Public post' })).toHaveProperty(
      'disabled',
      true
    );
    expect(
      screen.getByRole('button', { name: 'Selected post' })
    ).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByText('fb_post_lookup_title'));
    locate();
    await screen.findByText('Dark post fixture');
    expect(screen.getByRole('button', { name: 'fb_post_add' })).toHaveProperty(
      'disabled',
      true
    );
    expect(screen.getByText('shared_posts_limit')).toBeTruthy();
  });
});
