import type { ScheduledAutomationPostView } from '@gitroom/nestjs-libraries/dtos/flows/scheduled-post.dto';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
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
  ] as ScheduledAutomationPostView[],
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
  data.posts = [
    {
      id: 'local',
      caption: 'Agendamento',
      publishDate: '2026-11-01T12:00:00Z',
      status: 'waiting',
      thumbnailUrl: '/uploads/post.jpg',
      state: 'QUEUE',
    },
  ];
});
describe('galeria unica de publicacoes', () => {
  it('deduplica o Reel publicado pelo permalink antes de resolver aliases sem mudar o vinculo', () => {
    data.posts[0] = {
      ...data.posts[0],
      status: 'published',
      state: 'PUBLISHED',
      publishedPostIds: ['98765'],
    };
    const change = vi.fn(),
      preview = vi.fn();
    render(
      <AutomationPublicationSelector
        platform="facebook"
        integrationId="fb"
        mode="scheduled"
        scheduledPostId="local"
        postIds={[]}
        posts={[
          {
            id: '123_456',
            caption: 'Reel remoto',
            permalink: 'https://www.facebook.com/reel/98765/',
          },
        ]}
        onChange={change}
        onPreviewChange={preview}
      />
    );
    expect(screen.queryByRole('button', { name: 'Reel remoto' })).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Agendamento' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(screen.queryByText('scheduled_badge')).toBeNull();
    expect(preview).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: 'local', caption: 'Agendamento' }),
    ]);
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_select_publications' })
    );
    expect(
      within(screen.getByRole('dialog')).queryByRole('button', {
        name: 'Reel remoto',
      })
    ).toBeNull();
    expect(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Agendamento',
      })
    ).toBeTruthy();
    expect(change).not.toHaveBeenCalled();
  });
  it('mantem visivel a referencia remota explicitamente selecionada', () => {
    data.posts[0] = {
      ...data.posts[0],
      status: 'published',
      state: 'PUBLISHED',
      publishedPostIds: ['98765'],
    };
    const change = vi.fn();
    render(
      <AutomationPublicationSelector
        platform="facebook"
        integrationId="fb"
        mode="specific"
        postIds={['123_456']}
        posts={[
          {
            id: '123_456',
            caption: 'Reel remoto',
            permalink: 'https://www.facebook.com/reel/98765/',
          },
        ]}
        onChange={change}
      />
    );
    expect(
      screen
        .getByRole('button', { name: 'Reel remoto' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(change).not.toHaveBeenCalled();
  });
  it('remove a etiqueta apos publicar nas duas miniaturas sem alterar o vinculo agendado', () => {
    const change = vi.fn();
    const props: ComponentProps<typeof AutomationPublicationSelector> = {
      integrationId: 'fb',
      mode: 'scheduled',
      postIds: [],
      scheduledPostId: 'local',
      posts: [],
      onChange: change,
    };
    const { rerender } = render(<AutomationPublicationSelector {...props} />);
    expect(screen.getByText('scheduled_badge')).toBeTruthy();
    data.posts[0] = {
      ...data.posts[0],
      state: 'PUBLISHED',
      status: 'published',
    };
    rerender(<AutomationPublicationSelector {...props} />);
    expect(screen.queryByText('scheduled_badge')).toBeNull();
    expect(screen.queryByText('scheduled_status_published')).toBeNull();
    expect(
      screen.queryByText('automation_publication_published_badge')
    ).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'Agendamento' })
        .getAttribute('aria-pressed')
    ).toBe('true');
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_select_publications' })
    );
    const modal = screen.getByRole('dialog');
    expect(
      within(modal).queryByText('automation_publication_published_badge')
    ).toBeNull();
    expect(within(modal).queryByText('scheduled_badge')).toBeNull();
    fireEvent.click(within(modal).getByRole('button', { name: 'Agendamento' }));
    expect(change).toHaveBeenCalledWith({
      mode: 'scheduled',
      postIds: [],
      scheduledPostId: 'local',
    });
  });
  it.each(['failed', 'cancelled', 'unavailable'] as const)(
    'nao rotula como agendado o status %s',
    (status) => {
      data.posts[0].status = status;
      render(
        <AutomationPublicationSelector
          integrationId="fb"
          mode="scheduled"
          postIds={[]}
          scheduledPostId="local"
          posts={[]}
          onChange={vi.fn()}
        />
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'automation_select_publications' })
      );
      expect(screen.queryByText('scheduled_badge')).toBeNull();
      expect(
        screen.queryByText('automation_publication_published_badge')
      ).toBeNull();
      expect(screen.getByRole('status').textContent).toBe(
        `scheduled_status_${status}`
      );
    }
  );
  it('restaura o foco ao fechar por Escape', () => {
    render(
      <AutomationPublicationSelector
        integrationId="fb"
        mode="specific"
        postIds={[]}
        posts={[]}
        onChange={vi.fn()}
      />
    );
    const open = screen.getByRole('button', {
      name: 'automation_select_publications',
    });
    open.focus();
    fireEvent.click(open);
    expect(document.activeElement).toBe(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'close' })
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(open);
  });
  it('nao deixa escolher agendamento indisponivel nem na miniatura nem no modal', () => {
    data.posts[0].status = 'cancelled';
    const change = vi.fn();
    render(
      <AutomationPublicationSelector
        integrationId="fb"
        mode="specific"
        postIds={[]}
        posts={[]}
        onChange={change}
      />
    );
    expect(screen.getByRole('button', { name: 'Agendamento' })).toHaveProperty(
      'disabled',
      true
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_select_publications' })
    );
    expect(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Agendamento',
      })
    ).toHaveProperty('disabled', true);
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

it('notifica a previa de publicacao carregada depois sem alterar selecao', async () => {
  const preview = vi.fn(),
    change = vi.fn();
  const props = {
    integrationId: 'ig',
    mode: 'specific' as const,
    postIds: ['late'],
    posts: [] as any[],
    onChange: change,
    onPreviewChange: preview,
  };
  const view = render(<AutomationPublicationSelector {...props} />);
  expect(preview).toHaveBeenLastCalledWith([{ id: 'late' }]);
  view.rerender(
    <AutomationPublicationSelector
      {...props}
      posts={[
        { id: 'late', thumbnailUrl: '/late.jpg', caption: 'Pagina adicional' },
      ]}
    />
  );
  await waitFor(() =>
    expect(preview).toHaveBeenLastCalledWith([
      { id: 'late', thumbnailUrl: '/late.jpg', caption: 'Pagina adicional' },
    ])
  );
  expect(change).not.toHaveBeenCalled();
});

describe('origens combinadas sem quarto modo operacional', () => {
  const posts = [
    { id: '123_1', caption: 'Normal', thumbnailUrl: '/normal.jpg' },
    {
      id: '123_2',
      caption: 'Dark A',
      thumbnailUrl: '/dark-a.jpg',
      isPublished: false,
      locatedById: true,
    },
    {
      id: '123_3',
      caption: 'Dark B',
      thumbnailUrl: '/dark-b.jpg',
      isPublished: false,
      locatedById: true,
    },
  ];
  function Editor({ change = vi.fn() }: any) {
    const [value, setValue] = useState<any>({
      mode: 'specific',
      postIds: posts.map((p) => p.id),
    });
    return (
      <AutomationPublicationSelector
        platform="facebook"
        integrationId="fb"
        {...value}
        posts={posts}
        onChange={(v) => {
          setValue(v);
          change(v);
        }}
      />
    );
  }
  it('restaura posts normais e dois dark posts apos all next specific sem IDs inativos', () => {
    const change = vi.fn();
    render(<Editor change={change} />);
    fireEvent.click(
      screen.getByRole('radio', { name: 'automation_facebook_all_posts' })
    );
    expect(change).toHaveBeenLastCalledWith({ mode: 'all', postIds: [] });
    fireEvent.click(
      screen.getByRole('radio', { name: 'wizard_next_publication' })
    );
    expect(change).toHaveBeenLastCalledWith({
      mode: 'next_publication',
      postIds: [],
    });
    fireEvent.click(
      screen.getByRole('radio', { name: 'automation_facebook_specific_post' })
    );
    expect(change).toHaveBeenLastCalledWith({
      mode: 'specific',
      postIds: ['123_1', '123_2', '123_3'],
    });
    for (const post of posts)
      expect(
        screen
          .getByRole('button', { name: post.caption })
          .getAttribute('aria-pressed')
      ).toBe('true');
  });
  it('nao restaura alvos removidos deliberadamente', () => {
    const change = vi.fn();
    render(<Editor change={change} />);
    for (const post of posts)
      fireEvent.click(screen.getByRole('button', { name: post.caption }));
    fireEvent.click(
      screen.getByRole('radio', { name: 'automation_facebook_all_posts' })
    );
    fireEvent.click(
      screen.getByRole('radio', { name: 'automation_facebook_specific_post' })
    );
    expect(change).toHaveBeenLastCalledWith({ mode: 'specific', postIds: [] });
  });
  it('nao recupera selecao de outra conta', () => {
    const change = vi.fn();
    const view = render(
      <AutomationPublicationSelector
        platform="facebook"
        integrationId="fb"
        mode="specific"
        postIds={['123_2']}
        posts={posts}
        onChange={change}
      />
    );
    view.rerender(
      <AutomationPublicationSelector
        platform="facebook"
        integrationId="other"
        mode="all"
        postIds={[]}
        posts={[]}
        onChange={change}
      />
    );
    fireEvent.click(
      screen.getByRole('radio', { name: 'automation_facebook_specific_post' })
    );
    expect(change).toHaveBeenLastCalledWith({ mode: 'specific', postIds: [] });
  });
  it('restaura agendamento exclusivo sem misturar IDs remotos', () => {
    const change = vi.fn();
    function ScheduledEditor() {
      const [value, setValue] = useState<any>({
        mode: 'scheduled',
        postIds: [],
        scheduledPostId: 'local',
      });
      return (
        <AutomationPublicationSelector
          platform="facebook"
          integrationId="fb"
          {...value}
          posts={posts}
          onChange={(v) => {
            setValue(v);
            change(v);
          }}
        />
      );
    }
    render(<ScheduledEditor />);
    fireEvent.click(
      screen.getByRole('radio', { name: 'automation_facebook_all_posts' })
    );
    expect(change).toHaveBeenLastCalledWith({ mode: 'all', postIds: [] });
    fireEvent.click(
      screen.getByRole('radio', { name: 'automation_facebook_specific_post' })
    );
    expect(change).toHaveBeenLastCalledWith({
      mode: 'scheduled',
      postIds: [],
      scheduledPostId: 'local',
    });
  });
  it.each([false, true, undefined, 'false', 0, null])(
    'badge usa booleano estrito %s nas duas galerias',
    (isPublished) => {
      const post = {
        id: '123_2',
        caption: 'Recuperado',
        isPublished,
        locatedById: true,
      };
      render(
        <AutomationPublicationSelector
          platform="facebook"
          integrationId="fb"
          mode="specific"
          postIds={['123_2']}
          posts={[post as any]}
          onChange={vi.fn()}
        />
      );
      const key =
        isPublished === false ? 'fb_post_dark_badge' : 'fb_post_by_id_badge';
      expect(
        within(screen.getByRole('button', { name: 'Recuperado' })).getByText(
          key
        )
      ).toBeTruthy();
      fireEvent.click(
        screen.getByRole('button', { name: 'automation_select_publications' })
      );
      expect(
        within(
          within(screen.getByRole('dialog')).getByRole('button', {
            name: 'Recuperado',
          })
        ).getByText(key)
      ).toBeTruthy();
    }
  );
  it('nao rotula post normal nem muda badges do Instagram', () => {
    const view = render(
      <AutomationPublicationSelector
        platform="facebook"
        integrationId="fb"
        mode="specific"
        postIds={['123_1']}
        posts={posts.slice(0, 1)}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText('fb_post_dark_badge')).toBeNull();
    expect(screen.queryByText('fb_post_by_id_badge')).toBeNull();
    view.rerender(
      <AutomationPublicationSelector
        platform="instagram"
        integrationId="ig"
        mode="specific"
        postIds={['123_2']}
        posts={posts}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText('fb_post_dark_badge')).toBeNull();
    expect(screen.queryByText('fb_post_by_id_badge')).toBeNull();
  });
});
