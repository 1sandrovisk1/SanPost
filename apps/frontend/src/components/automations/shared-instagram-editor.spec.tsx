import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
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
  WizardPhonePreview: () => <div>preview</div>,
}));
vi.mock('./add-link-modal.component', () => ({
  AddLinkModal: (): null => null,
}));
vi.mock('./hooks/use-shared-flows', () => ({ useSharedFlowData: (path: string) => ({ data: { posts: path?.includes('/ig1?') ? [{ id: 'post-da-ig1', caption: 'Agendado IG1', publishDate: '2026-11-01T12:00:00Z', status: 'waiting' }] : [], nextCursor: null as string | null }, mutate: vi.fn() }) }));

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
    await screen.findByText('webhook_ok');
    const toggle = screen.getByRole('switch', { name: 'shared_add_public_reply' });
    fireEvent.click(toggle);
    const reply = screen.getByLabelText('shared_public_reply');
    const message = screen.getByLabelText('shared_message');
    expect(!!(toggle.compareDocumentPosition(reply) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(!!(reply.compareDocumentPosition(message) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(screen.getByPlaceholderText('automation_public_reply_placeholder')).toBe(reply);
    expect(screen.getByPlaceholderText('automation_private_message_placeholder')).toBe(message);
    expect(screen.getByText('variables_hint')).toBeTruthy();
    expect(screen.getByText('shared_link_hint')).toBeTruthy();
  });
  it('prepara um unico rascunho para aliases e finaliza no mesmo ID sem perder a mensagem', async () => {
    render(<AutomationWizardComponent />);
    expect(
      (screen.getByLabelText('wizard_name') as HTMLInputElement).value
    ).toBe('automation_name_instagram_comment');
    choose();
    await screen.findByText('webhook_ok');
    fireEvent.change(screen.getByPlaceholderText('automation_private_message_placeholder'), {
      target: { value: 'Mensagem preservada' },
    });
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
    fireEvent.click(
      screen.getByRole('button', { name: 'automation_create_activate' })
    );
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
    await screen.findByText('webhook_ok');
    fireEvent.change(screen.getByPlaceholderText('automation_private_message_placeholder'), {
      target: { value: 'Oi' },
    });
    expect(
      (
        screen.getByRole('button', {
          name: 'automation_create_activate',
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
          name: 'wizard_update',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    state.aliases = [{ aliasMediaId: 'ad' }];
    rerender(
      <AutomationWizardComponent flowId="saved" initialFlow={initialFlow} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'wizard_update' }));
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
    render(<StoryWizardComponent />);
    expect((screen.getByLabelText('flow_name') as HTMLInputElement).value).toBe(
      'automation_name_instagram_story'
    );
    fireEvent.change(screen.getByLabelText('wizard_account'), {
      target: { value: 'ig2' },
    });
    await screen.findByText('webhook_ok');
    expect(
      screen.getByRole('button', { name: 'automation_create_activate' })
    ).toBeTruthy();
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
    render(<AutomationWizardComponent />); choose();
    fireEvent.click(screen.getByRole('button', { name: 'automation_select_publications' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Agendado IG1' }).at(-1)!);
    fireEvent.click(screen.getByRole('button', { name: 'confirm' }));
    fireEvent.change(screen.getByLabelText('wizard_account'), { target: { value: 'ig2' } });
    expect(screen.queryByText('scheduled_status_waiting')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Agendado IG1' })).toBeNull();
  });

});
