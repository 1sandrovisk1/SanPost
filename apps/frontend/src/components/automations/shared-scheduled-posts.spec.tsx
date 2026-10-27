import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ScheduledPostSelector } from './shared-scheduled-posts.component';
const mock = vi.hoisted(() => ({
  result: {
    data: undefined as any,
    error: undefined as any,
    isLoading: false,
    mutate: vi.fn(),
  },
  hook: vi.fn(),
}));
vi.mock('./hooks/use-shared-flows', () => ({
  useSharedFlowData: (path: string) => {
    mock.hook(path);
    return mock.result;
  },
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
afterEach(cleanup);
describe('selecao de post agendado', () => {
  it('exibe data e estado e envia somente o id interno escolhido', () => {
    mock.result.data = {
      posts: [
        {
          id: 'local-1',
          caption: 'Post do dia 1',
          publishDate: '2026-11-01T12:00:00Z',
          status: 'waiting',
        },
      ],
      nextCursor: null,
    };
    const change = vi.fn();
    render(
      <ScheduledPostSelector integrationId="ig" value="" onChange={change} />
    );
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'local-1' },
    });
    expect(change).toHaveBeenCalledWith('local-1');
    expect(screen.getByText(/Post do dia 1/)).toBeTruthy();
  });
  it('mantem o post selecionado apos publicar e mostra seu estado', () => {
    mock.result.data = {
      posts: [],
      selected: {
        id: 'local-1',
        caption: 'Publicado',
        publishDate: '2026-11-01T12:00:00Z',
        status: 'published',
      },
      nextCursor: null,
    };
    render(
      <ScheduledPostSelector
        integrationId="fb"
        value="local-1"
        onChange={vi.fn()}
        disabled
      />
    );
    expect(screen.getByRole('combobox').hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('status').textContent).toContain(
      'scheduled_status_published'
    );
  });
  it('mostra falha de consulta sem tratar resposta de erro como lista', () => {
    mock.result.data = undefined;
    mock.result.error = new Error('failed');
    render(
      <ScheduledPostSelector integrationId="fb" value="" onChange={vi.fn()} />
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    mock.result.error = undefined;
  });
});
