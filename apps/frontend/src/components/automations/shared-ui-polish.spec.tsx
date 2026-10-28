import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { AutomationEditorFeedback } from './shared-editor-footer.component';
import { selectedPublicationPreviews } from './shared-publication-preview';
import { AutomationMessageVariables } from './shared-message-variables.component';
import { AutomationContextHelp } from './shared-context-help.component';
import { PublicationPreviewControls } from './shared-response-controls.component';
import { WizardPhonePreview } from './wizard-phone-preview.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
afterEach(cleanup);
describe('refinamento do editor', () => {
  it('nao repete o estado ativo mas preserva pendencias e impacto', () => {
    const props = {
      status: 'ACTIVE' as const,
      dirty: false,
      busy: false,
      valid: true,
      onSave: vi.fn(),
    };
    const view = render(<AutomationEditorFeedback {...props} />);
    expect(screen.queryByText('shared_is_active')).toBeNull();
    view.rerender(
      <AutomationEditorFeedback {...props} dirty impact="Cancela pendentes" />
    );
    expect(screen.getByText('shared_unsaved')).toBeTruthy();
    expect(screen.getByText('Cancela pendentes')).toBeTruthy();
  });
  it('projeta somente publicacoes selecionadas inclusive agendamento fora da pagina e IDs indisponiveis', () => {
    const posts = [
      { id: 'old', caption: 'Outra pagina', thumbnailUrl: '/thumb.jpg' },
    ];
    expect(
      selectedPublicationPreviews(
        { mode: 'specific', postIds: ['old', 'gone'] },
        posts,
        []
      )
    ).toEqual([posts[0], { id: 'gone' }]);
    const scheduled = {
      id: 's',
      caption: 'Video',
      mediaType: 'VIDEO',
      mediaUrl: '/clip.mp4',
      publishDate: '2026-11-01',
      state: 'QUEUE',
      status: 'waiting' as const,
    };
    expect(
      selectedPublicationPreviews(
        { mode: 'scheduled', postIds: [], scheduledPostId: 's' },
        [],
        [scheduled]
      )
    ).toMatchObject([{ id: 's', mediaType: 'VIDEO', mediaUrl: '/clip.mp4' }]);
    expect(
      selectedPublicationPreviews({ mode: 'all', postIds: ['old'] }, posts, [])
    ).toEqual([]);
  });
  it('nao pede selecionar um post ja selecionado cuja midia esta indisponivel', () => {
    render(
      <WizardPhonePreview
        activeTab="post"
        postSelected
        postCaption="Selecionado"
      />
    );
    expect(screen.queryByText('preview_no_post')).toBeNull();
    expect(
      screen.getByText('automation_preview_media_unavailable')
    ).toBeTruthy();
  });
  it('usa video em vez de img quando nao existe thumbnail', () => {
    const { container } = render(
      <WizardPhonePreview
        activeTab="post"
        postSelected
        postThumb="/clip.mp4"
        postMediaType="VIDEO"
      />
    );
    expect(container.querySelector('video')?.getAttribute('src')).toContain(
      '/clip.mp4'
    );
    expect(container.querySelector('img[src="/clip.mp4"]')).toBeNull();
  });
  it('insere variavel no cursor preservando texto e foco sem persistir', async () => {
    const insert = vi.fn();
    render(
      <>
        <textarea id="dm" defaultValue="Oi, tudo bem" />
        <AutomationMessageVariables textareaId="dm" onChange={insert} />
      </>
    );
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.focus(textarea);
    textarea.setSelectionRange(4, 4);
    fireEvent.select(textarea);
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_insert_variable' })
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_variable_commenter_name' })
    );
    expect(insert).toHaveBeenCalledWith('Oi, {commenter_name}tudo bem');
    await waitFor(() => expect(document.activeElement).toBe(textarea));
  });
});

it('ajuda e expansivel por clique e alternar a ilustracao so chama a selecao local', () => {
  const select = vi.fn();
  render(
    <>
      <AutomationContextHelp label="Ajuda do campo">
        Explicação
      </AutomationContextHelp>
      <PublicationPreviewControls
        posts={[
          { id: 'a', caption: 'Primeiro' },
          { id: 'b', caption: 'Segundo' },
        ]}
        value="a"
        onChange={select}
      />
    </>
  );
  const help = screen.getByLabelText('Ajuda do campo');
  expect(help.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(help);
  expect(help.getAttribute('aria-expanded')).toBe('true');
  fireEvent.change(screen.getByLabelText('automation_preview_publication'), {
    target: { value: 'b' },
  });
  expect(select).toHaveBeenCalledWith('b');
});
