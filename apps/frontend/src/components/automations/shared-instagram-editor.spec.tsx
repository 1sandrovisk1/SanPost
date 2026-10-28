import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { AutomationWizardComponent } from './automation-wizard.component';
import { StoryWizardComponent } from './story-wizard.component';
import { useInstagramEditorConnection } from './shared-instagram-connection.component';
const state = vi.hoisted(() => ({
  fetch: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
  aliases: [] as any[],
}));
const translate = (key: string) => key;
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => translate,
  useTranslationSettings: () => ({ resolvedLanguage: 'pt' }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => state.fetch,
}));
vi.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: state.toast }),
}));
vi.mock(
  '@gitroom/frontend/components/launches/helpers/use.integration.list',
  () => ({
    useIntegrationList: () => ({
      data: [
        { id: 'ig1', identifier: 'instagram', name: 'IG one' },
        { id: 'ig2', identifier: 'instagram', name: 'IG two' },
      ],
    }),
  })
);
vi.mock('./hooks/use-flows', () => ({
  useIntegrationPosts: () => ({ data: [] as any[] }),
  useIntegrationStories: () => ({ data: [] as any[] }),
}));
vi.mock('./hooks/use-unmatched-comments', () => ({
  useAliases: () => ({ data: state.aliases }),
}));
vi.mock('./ad-aliases-field.component', () => ({
  AdAliasesField: ({ flowId }: { flowId: string }) => (
    <div>aliases:{flowId || 'none'}</div>
  ),
}));
vi.mock('./wizard-phone-preview.component', () => ({
  WizardPhonePreview: (props: any) => (
    <div
      data-testid="phone-preview"
      data-tab={props.activeTab}
      data-reply={props.replyMessage}
      data-stage={props.journey?.stage}
      data-thumb={props.postThumb}
      data-selected={props.postSelected}
    >
      preview
    </div>
  ),
}));
vi.mock('./add-link-modal.component', () => ({
  AddLinkModal: (): null => null,
}));
vi.mock('./hooks/use-shared-flows', () => ({
  useSharedFlowData: (path: string) => ({
    data: {
      posts: path?.includes('/ig1?')
        ? [
            {
              id: 'post-da-ig1',
              caption: 'Agendado IG1',
              thumbnailUrl: '/scheduled.jpg',
              publishDate: '2026-11-01T12:00:00Z',
              status: 'waiting',
            },
          ]
        : [],
      nextCursor: null as string | null,
    },
    mutate: vi.fn(),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.aliases = [];
  state.fetch.mockImplementation(async (url: string) => ({
    ok: true,
    json: async () =>
      url.endsWith('webhook-status')
        ? { ok: true }
        : url === '/credentials/facebook/messaging-tokens'
        ? { instagramTokens: [] as any[] }
        : { id: 'draft' },
  }));
});
afterEach(cleanup);
const choose = () =>
  fireEvent.change(screen.getByLabelText('wizard_account'), {
    target: { value: 'ig1' },
  });
describe('entrada direta Instagram', () => {
  it('usa as mesmas labels e exemplos na ordem palavras chave, resposta publica e privada', async () => {
    render(<AutomationWizardComponent />);
    choose();
    await screen.findByLabelText('automation_webhook_configured');
    const toggle = screen.getByRole('switch', {
      name: 'shared_add_public_reply',
    });
    fireEvent.click(toggle);
    const reply = screen.getByLabelText('shared_public_reply');
    const message = screen.getByLabelText('shared_message');
    expect(
      !!(
        toggle.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
    expect(
      !!(
        reply.compareDocumentPosition(message) &
        Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true);
    expect(
      screen.getByPlaceholderText('automation_public_reply_placeholder')
    ).toBe(reply);
    expect(
      screen.getByPlaceholderText('automation_private_message_placeholder')
    ).toBe(message);
    expect(
      screen.getByRole('combobox', { name: 'automation_insert_variable' })
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_link_help' })
    );
    expect(screen.getByText('shared_link_hint')).toBeTruthy();
  });
  it('prepara um unico rascunho para aliases e finaliza no mesmo ID sem perder a mensagem', async () => {
    render(<AutomationWizardComponent />);
    expect(
      (screen.getByLabelText('wizard_name') as HTMLInputElement).value
    ).toBe('automation_name_instagram_comment');
    choose();
    await screen.findByLabelText('automation_webhook_configured');
    fireEvent.change(
      screen.getByPlaceholderText('automation_private_message_placeholder'),
      {
        target: { value: 'Mensagem preservada' },
      }
    );
    const prepare = screen.getByRole('button', {
      name: 'automation_prepare_draft',
    });
    fireEvent.click(prepare);
    fireEvent.click(prepare);
    await screen.findByText('aliases:draft');
    expect(
      (screen.getByLabelText('wizard_account') as HTMLSelectElement).disabled
    ).toBe(true);
    expect(
      screen.queryByRole('button', { name: 'automation_prepare_draft' })
    ).toBeNull();
    state.aliases = [{ aliasMediaId: 'dark-id' }];
    fireEvent.change(screen.getByLabelText('wizard_name'), {
      target: { value: 'Novo nome' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'activate_flow' }));
    await waitFor(() =>
      expect(state.fetch).toHaveBeenCalledWith(
        '/flows/draft/quick-update',
        expect.anything()
      )
    );
    const calls = state.fetch.mock.calls;
    expect(calls.filter(([url]) => url === '/flows')).toHaveLength(1);
    expect(calls.some(([url]) => url === '/flows/quick-create')).toBe(false);
    expect(
      JSON.parse(calls.find(([url]) => url.endsWith('quick-update'))![1].body)
        .postIds
    ).toBeUndefined();
    expect(
      JSON.parse(calls.find(([url]) => url.endsWith('quick-update'))![1].body)
    ).toMatchObject({
      name: 'Novo nome',
      dmMessage: 'Mensagem preservada',
      postMode: 'specific',
      triggerType: 'comment_on_post',
    });
  });
  it('nao ativa escopo especifico vazio e permite tentar novamente a preparacao que falhou', async () => {
    state.fetch.mockImplementation(async (url: string) => ({
      ok: url !== '/flows',
      json: async () => ({ ok: true }),
    }));
    render(<AutomationWizardComponent />);
    choose();
    await screen.findByLabelText('automation_webhook_configured');
    fireEvent.change(
      screen.getByPlaceholderText('automation_private_message_placeholder'),
      {
        target: { value: 'Oi' },
      }
    );
    expect(
      (
        screen.getByRole('switch', {
          name: 'activate_flow',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_prepare_draft' })
    );
    await waitFor(() => expect(state.toast).toHaveBeenCalled());
    expect(
      (
        screen.getByRole('button', {
          name: 'automation_prepare_draft',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
    expect(
      (screen.getByLabelText('wizard_account') as HTMLSelectElement).disabled
    ).toBe(false);
  });
  it('reabre um rascunho so com aliases sem copiar IDs e tolera erro na consulta', async () => {
    state.aliases = { message: 'Unavailable' } as any;
    const initialFlow = {
      name: 'Alias salvo',
      integrationId: 'ig1',
      nodes: [
        {
          type: 'TRIGGER',
          data: JSON.stringify({
            triggerType: 'comment_on_post',
            mode: 'specific',
            postIds: [],
          }),
        },
        { type: 'SEND_DM', data: JSON.stringify({ message: 'Oi' }) },
      ],
    };
    const { rerender } = render(
      <AutomationWizardComponent flowId="saved" initialFlow={initialFlow} />
    );
    expect(
      (
        screen.getByRole('button', {
          name: 'save_flow',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    state.aliases = [{ aliasMediaId: 'ad' }];
    rerender(
      <AutomationWizardComponent flowId="saved" initialFlow={initialFlow} />
    );
    fireEvent.change(screen.getByLabelText('shared_message'), {
      target: { value: 'Oi atualizado' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'save_flow' }));
    await waitFor(() =>
      expect(state.fetch).toHaveBeenCalledWith(
        '/flows/saved/quick-update',
        expect.anything()
      )
    );
    const body = JSON.parse(
      state.fetch.mock.calls.find(([url]) => url.endsWith('quick-update'))![1]
        .body
    );
    expect(body.postMode).toBe('specific');
    expect(body.postIds).toBeUndefined();
  });
  it('Story novo mantem seu editor, nome inicial e verificacao de conta', async () => {
    expect(screen.queryByText('automation_account_fixed')).toBeNull();
    render(<StoryWizardComponent />);
    expect((screen.getByLabelText('flow_name') as HTMLInputElement).value).toBe(
      'automation_name_instagram_story'
    );
    fireEvent.change(screen.getByLabelText('wizard_account'), {
      target: { value: 'ig2' },
    });
    await screen.findByLabelText('automation_webhook_configured');
    expect(screen.getByRole('switch', { name: 'activate_flow' })).toBeTruthy();
    expect(state.fetch.mock.calls.some(([url]) => url === '/flows')).toBe(
      false
    );
  });
  it('ignora verificacao antiga e rejeita HTTP falho mesmo com ok no JSON', async () => {
    let resolveFirst: (value: any) => void = () => {};
    state.fetch.mockImplementation((url: string) =>
      url.includes('ig1')
        ? new Promise((r) => {
            resolveFirst = r;
          })
        : Promise.resolve({ ok: false, json: async () => ({ ok: true }) })
    );
    function Check({ id }: { id: string }) {
      const c = useInstagramEditorConnection(id);
      return <div>{c.loading ? 'loading' : c.ready ? 'ready' : 'failed'}</div>;
    }
    const { rerender } = render(<Check id="ig1" />);
    rerender(<Check id="ig2" />);
    await screen.findByText('failed');
    resolveFirst({ ok: true, json: async () => ({ ok: true }) });
    await waitFor(() => expect(screen.queryByText('ready')).toBeNull());
  });
  it('trocar a conta limpa o agendamento anterior', async () => {
    render(<AutomationWizardComponent />);
    choose();
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_select_publications' })
    );
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Agendado IG1' }).at(-1)!
    );
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    fireEvent.change(screen.getByLabelText('wizard_account'), {
      target: { value: 'ig2' },
    });
    expect(screen.queryByText('scheduled_status_waiting')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Agendado IG1' })).toBeNull();
  });
});

describe('jornada no editor Instagram', () => {
  for (const Editor of [AutomationWizardComponent, StoryWizardComponent])
    it(`${
      Editor === AutomationWizardComponent ? 'Comentario' : 'Story'
    } atualiza snapshot limpo e preserva campos locais durante revalidacao`, async () => {
      const snapshot = (updatedAt: string, message: string) => ({
        id: 'ig-rule',
        integrationId: 'ig1',
        name: 'Regra',
        status: 'PAUSED',
        updatedAt,
        nodes: [
          { type: 'TRIGGER', data: JSON.stringify({ mode: 'all' }) },
          { type: 'SEND_DM', data: JSON.stringify({ message }) },
        ],
      });
      const view = render(
        <Editor
          flowId="ig-rule"
          initialFlow={snapshot('2026-10-27T12:00:00Z', 'Original')}
        />
      );
      await screen.findByDisplayValue('Original');
      expect(screen.queryByText('automation_account_fixed')).toBeNull();
      expect(
        screen.queryByRole('heading', {
          name:
            Editor === AutomationWizardComponent
              ? 'wizard_editing_title'
              : 'story_wizard_title_edit',
        })
      ).toBeNull();
      expect(
        screen.getByRole('switch', { name: 'activate_flow' })
      ).toBeTruthy();
      view.rerender(
        <Editor
          flowId="ig-rule"
          initialFlow={snapshot('2026-10-27T12:01:00Z', 'Atualizada')}
        />
      );
      expect(await screen.findByDisplayValue('Atualizada')).toBeTruthy();
      expect(screen.queryByText('shared_unsaved')).toBeNull();
      fireEvent.change(screen.getByLabelText('shared_message'), {
        target: { value: 'Minha edicao' },
      });
      view.rerender(
        <Editor
          flowId="ig-rule"
          initialFlow={snapshot('2026-10-27T12:02:00Z', 'Remota')}
        />
      );
      expect(screen.getByLabelText('shared_message')).toHaveProperty(
        'value',
        'Minha edicao'
      );
      expect(screen.getByText('shared_unsaved')).toBeTruthy();
      fireEvent.change(screen.getByLabelText('shared_message'), {
        target: { value: 'Atualizada' },
      });
      expect(await screen.findByDisplayValue('Remota')).toBeTruthy();
      expect(screen.queryByText('shared_unsaved')).toBeNull();
    });
  it('mantem o link do rascunho salvo se a ativacao falhar e tenta ativar o mesmo ID', async () => {
    state.fetch.mockImplementation(async (url: string) => ({
      ok: !url.endsWith('/status'),
      json: async () =>
        url.endsWith('webhook-status')
          ? { ok: true }
          : url === '/flows'
          ? { id: 'prepared', status: 'DRAFT', updatedAt: 'v1' }
          : url.endsWith('quick-update')
          ? { id: 'prepared', status: 'DRAFT', updatedAt: 'v2' }
          : url.endsWith('/status')
          ? { message: 'AUTHORIZATION_CHECK_REQUIRED' }
          : { instagramTokens: [] as any[] },
    }));
    render(<AutomationWizardComponent />);
    choose();
    await screen.findByLabelText('automation_webhook_configured');
    fireEvent.click(screen.getByRole('radio', { name: 'wizard_all_posts' }));
    fireEvent.change(screen.getByLabelText('shared_message'), {
      target: { value: 'Entrega' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'activate_flow' }));
    await screen.findByText(/automation_activation_failed_saved/);
    expect(state.push).toHaveBeenCalledWith('/automations/instagram/prepared');
    fireEvent.click(screen.getByRole('switch', { name: 'activate_flow' }));
    await waitFor(() =>
      expect(
        state.fetch.mock.calls.filter(
          ([url]) => url === '/flows/prepared/status'
        )
      ).toHaveLength(2)
    );
    expect(
      state.fetch.mock.calls.filter(([url]) => url === '/flows')
    ).toHaveLength(1);
    expect(
      state.fetch.mock.calls.filter(([url]) => url.endsWith('quick-update'))
    ).toHaveLength(1);
  });
  it('resposta publica pertence a Resposta e a previa acompanha cada variacao', async () => {
    render(<AutomationWizardComponent />);
    choose();
    await screen.findByLabelText('automation_webhook_configured');
    const section = screen
      .getByRole('switch', { name: 'shared_add_public_reply' })
      .closest('section')!;
    fireEvent.click(
      within(section).getByRole('switch', { name: 'shared_add_public_reply' })
    );
    fireEvent.change(screen.getByLabelText('shared_public_reply'), {
      target: { value: 'Primeira' },
    });
    fireEvent.click(
      screen.getAllByRole('button', { name: 'wizard_add_reply_variant' })[0]
    );
    fireEvent.change(screen.getByLabelText('shared_reply_variant 2'), {
      target: { value: 'Segunda' },
    });
    fireEvent.focus(screen.getByLabelText('shared_reply_variant 2'));
    expect(screen.getByTestId('phone-preview').getAttribute('data-reply')).toBe(
      'Segunda'
    );
    expect(screen.getByTestId('phone-preview').getAttribute('data-tab')).toBe(
      'comments'
    );
    fireEvent.focus(screen.getByLabelText('shared_message'));
    expect(screen.getByTestId('phone-preview').getAttribute('data-tab')).toBe(
      'dm'
    );
    expect(screen.queryByLabelText('shared_reply_preview')).toBeNull();
  });
  it('gate nao permite ativar sem mensagem final e organiza tres etapas', async () => {
    render(<AutomationWizardComponent />);
    choose();
    await screen.findByLabelText('automation_webhook_configured');
    fireEvent.click(
      screen.getByRole('checkbox', { name: /story_require_follow/ })
    );
    expect(screen.getByText('automation_gate_opening')).toBeTruthy();
    expect(screen.getByText('automation_final_message_required')).toBeTruthy();
    expect(
      (
        screen.getByRole('switch', {
          name: 'activate_flow',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });
  for (const Editor of [AutomationWizardComponent, StoryWizardComponent])
    it(`${
      Editor === AutomationWizardComponent ? 'Comentario' : 'Story'
    } exige texto do gate para a previa corresponder ao envio`, async () => {
      render(<Editor />);
      choose();
      await screen.findByLabelText('automation_webhook_configured');
      fireEvent.change(screen.getByLabelText('shared_message'), {
        target: { value: 'Final' },
      });
      fireEvent.click(
        screen.getByRole('checkbox', { name: /story_require_follow/ })
      );
      fireEvent.change(screen.getByLabelText('story_follow_gate_label'), {
        target: { value: '' },
      });
      expect(
        screen.getByText('automation_follow_messages_required')
      ).toBeTruthy();
      expect(
        screen.getByRole('switch', { name: 'activate_flow' })
      ).toHaveProperty('disabled', true);
    });
});

it('previa usa agendamento selecionado e limpa ao trocar conta sem gravar', async () => {
  render(<AutomationWizardComponent />);
  choose();
  await screen.findByLabelText('automation_webhook_configured');
  fireEvent.click(
    screen.getByRole('button', { name: 'automation_select_publications' })
  );
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Agendado IG1' }).at(-1)!
  );
  fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
  await waitFor(() =>
    expect(screen.getByTestId('phone-preview').getAttribute('data-thumb')).toBe(
      '/scheduled.jpg'
    )
  );
  fireEvent.change(screen.getByLabelText('wizard_account'), {
    target: { value: 'ig2' },
  });
  await waitFor(() =>
    expect(
      screen.getByTestId('phone-preview').getAttribute('data-thumb')
    ).toBeNull()
  );
  expect(state.fetch.mock.calls.some(([url]) => url === '/flows')).toBe(false);
});
it('aninha os IDs de Dark Posts no escopo de publicacoes especificas', async () => {
  render(<AutomationWizardComponent />);
  choose();
  await screen.findByLabelText('automation_webhook_configured');
  fireEvent.click(screen.getByRole('radio', { name: 'wizard_specific_post' }));
  const radio = screen.getByRole('radio', { name: 'wizard_specific_post' });
  expect(
    radio
      .closest('div')
      ?.parentElement?.contains(screen.getByText('trigger_ad_ids_label'))
  ).toBe(true);
});
