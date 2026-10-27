import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState, type ComponentProps } from 'react';
import { AutomationPublicationSelector } from './shared-publication-selector.component';
const data = vi.hoisted(() => ({
  posts: [
    {
      id: 'local',
      caption: 'Agendamento',
      publishDate: '2026-11-01T12:00:00Z',
      status: 'waiting',
      thumbnailUrl: '/uploads/post.jpg',
      state: 'QUEUE',
    },
  ],
  nextCursor: null,
}));
vi.mock('./hooks/use-shared-flows', () => ({
  useSharedFlowData: () => ({ data: { ...data }, mutate: vi.fn() }),
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
  useTranslationSettings: () => ({ resolvedLanguage: 'pt' }),
}));
afterEach(cleanup);
beforeEach(() => {
  data.posts[0].status = 'waiting';
  data.posts[0].state = 'QUEUE';
});
describe('galeria unica de publicacoes', () => {
  it('remove a etiqueta apos publicar nas duas miniaturas sem alterar o vinculo agendado', () => {
    const change = vi.fn();
    const props: ComponentProps<typeof AutomationPublicationSelector> = { integrationId: 'fb', mode: 'scheduled', postIds: [], scheduledPostId: 'local', posts: [], onChange: change };
    const { rerender } = render(<AutomationPublicationSelector {...props} />);
    expect(screen.getByText('scheduled_badge')).toBeTruthy();
    data.posts[0] = { ...data.posts[0], state: 'PUBLISHED', status: 'published' };
    rerender(<AutomationPublicationSelector {...props} />);
    expect(screen.queryByText('scheduled_badge')).toBeNull();
    expect(screen.queryByText('automation_publication_published_badge')).toBeNull();
    expect(screen.getByRole('button', { name: 'Agendamento' }).getAttribute('aria-pressed')).toBe('true');
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'automation_select_publications' }));
    const modal = screen.getByRole('dialog');
    expect(within(modal).queryByText('automation_publication_published_badge')).toBeNull();
    expect(within(modal).queryByText('scheduled_badge')).toBeNull();
    fireEvent.click(within(modal).getByRole('button', { name: 'Agendamento' }));
    expect(change).toHaveBeenCalledWith({ mode: 'scheduled', postIds: [], scheduledPostId: 'local' });
  });
  it.each(['failed', 'cancelled', 'unavailable'])('nao rotula como agendado o status %s', status => {
    data.posts[0].status = status;
    render(<AutomationPublicationSelector integrationId="fb" mode="scheduled" postIds={[]} scheduledPostId="local" posts={[]} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'automation_select_publications' }));
    expect(screen.queryByText('scheduled_badge')).toBeNull();
    expect(screen.queryByText('automation_publication_published_badge')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(`scheduled_status_${status}`);
  });
  it('restaura o foco ao fechar por Escape', () => {
    render(<AutomationPublicationSelector integrationId="fb" mode="specific" postIds={[]} posts={[]} onChange={vi.fn()} />);
    const open = screen.getByRole('button', { name: 'automation_select_publications' });
    open.focus();
    fireEvent.click(open);
    expect(document.activeElement).toBe(within(screen.getByRole('dialog')).getByRole('button', { name: 'close' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(open);
  });
  it('nao deixa escolher agendamento indisponivel nem na miniatura nem no modal', () => {
    data.posts[0].status = 'cancelled';
    const change = vi.fn();
    render(<AutomationPublicationSelector integrationId="fb" mode="specific" postIds={[]} posts={[]} onChange={change} />);
    expect(screen.getByRole('button', { name: 'Agendamento' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'automation_select_publications' }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Agendamento' })).toHaveProperty('disabled', true);
    expect(change).not.toHaveBeenCalled();
    data.posts[0].status = 'waiting';
  });
  it('seleciona agendado pela miniatura sem misturar ids internos e remotos', () => {
    const change = vi.fn();
    render(
      <AutomationPublicationSelector
        integrationId="fb"
        mode="specific"
        postIds={['123_456']}
        posts={[
          {
            id: '123_456',
            caption: 'Publicado',
            thumbnailUrl: '/published.jpg',
          },
        ]}
        onChange={change}
      />
    );
    expect(screen.queryByText('scheduled_post_mode')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_select_publications' })
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getAllByText('scheduled_badge').length).toBeGreaterThan(0);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /Agendamento/,
      })
    );
    expect(change).toHaveBeenCalledWith({
      mode: 'scheduled',
      postIds: [],
      scheduledPostId: 'local',
    });
    expect(document.querySelector('img[src="/uploads/post.jpg"]')).toBeTruthy();
  });
  it('trocar para publicado limpa o agendado e proxima publicacao limpa todos os alvos', () => {
    const change = vi.fn();
    function Editor() {
      const [value, setValue] = useState<any>({
        mode: 'scheduled',
        postIds: [],
        scheduledPostId: 'local',
      });
      return (
        <AutomationPublicationSelector
          integrationId="fb"
          {...value}
          posts={[{ id: '123_456', caption: 'Publicado' }]}
          onChange={(v) => {
            setValue(v);
            change(v);
          }}
        />
      );
    }
    render(<Editor />);
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_select_publications' })
    );
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: /Publicado/,
      })
    );
    expect(change).toHaveBeenLastCalledWith({
      mode: 'specific',
      postIds: ['123_456'],
    });
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    fireEvent.click(
      screen.getByRole('radio', { name: 'wizard_next_publication' })
    );
    expect(change).toHaveBeenLastCalledWith({
      mode: 'next_publication',
      postIds: [],
    });
  });
  it('nao permite mudar selecao bloqueada', () => {
    render(
      <AutomationPublicationSelector
        integrationId="ig"
        mode="scheduled"
        scheduledPostId="local"
        postIds={[]}
        posts={[]}
        disabled
        onChange={vi.fn()}
      />
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'automation_select_publications',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    for (const radio of screen.getAllByRole('radio'))
      expect((radio as HTMLInputElement).disabled).toBe(true);
  });
});
