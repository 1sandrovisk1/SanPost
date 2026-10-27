import React, { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from '@testing-library/react';
import { MetaCredentialsCard } from './meta-credentials.component';

const state = vi.hoisted(() => ({
  params: '',
  fetch: vi.fn(),
  mutate: vi.fn(),
  decide: vi.fn(),
  credential: {
    data: { clientId: '__REDACTED__', instagramAppId: '__REDACTED__' },
  },
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.params),
}));
vi.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ orgId: 'org', profileId: 'profile', role: 'ADMIN' }),
}));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => state.fetch,
}));
vi.mock('@gitroom/frontend/hooks/use-credentials.hook', () => ({
  useCredential: () => ({
    data: state.credential,
    isLoading: false,
    mutate: state.mutate,
  }),
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, fallback: string) => fallback || key,
}));
vi.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: vi.fn() }),
}));
vi.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useDecisionModal: () => ({ open: state.decide }),
}));
vi.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ frontEndUrl: 'https://example.com' }),
}));
vi.mock('./facebook-automation-setup.component', () => ({
  FacebookAutomationSetup: ({ onOpenMessenger }: any) => (
    <button onClick={onOpenMessenger}>Abrir Messenger</button>
  ),
}));
vi.mock('./messenger-webhook-setup.component', () => ({
  MessengerWebhookSetup: ({ onOpenFacebook }: any) => (
    <button onClick={onOpenFacebook}>Voltar ao Facebook</button>
  ),
}));
vi.mock(
  '@gitroom/frontend/components/settings/messaging-tokens-section.component',
  () => ({
    MessagingTokensProvider: ({ children }: any) => children,
    MessagingTokensDiagnostics: () => <p>Token metadata</p>,
    MessagingTokensSection: ({ section }: any) => {
      const [draft, setDraft] = useState('');
      return (
        <input
          aria-label={
            section === 'system-user'
              ? 'Rascunho local Sistema'
              : 'Rascunho local Instagram'
          }
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      );
    },
  })
);

beforeEach(() => {
  state.params = '';
  state.credential.data.instagramAppId = '__REDACTED__';
  vi.clearAllMocks();
  state.mutate.mockResolvedValue(undefined);
  state.decide.mockResolvedValue(true);
  state.fetch.mockResolvedValue({
    json: async () => ({ callbackUrl: '/webhook', verifyToken: 'test-only' }),
  });
});
afterEach(cleanup);

function openCard(configured = true) {
  render(<MetaCredentialsCard configured={configured} onMutate={vi.fn()} />);
  fireEvent.click(screen.getByText('Meta', { exact: true }));
}

describe('abas das credenciais Meta', () => {
  it('mostra somente o produto selecionado e permite navegar pelo teclado', () => {
    openCard();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByRole('tabpanel').getAttribute('aria-labelledby')).toBe(
      screen.getByRole('tab', { name: 'Facebook' }).id
    );
    fireEvent.keyDown(screen.getByRole('tab', { name: 'Facebook' }), {
      key: 'ArrowRight',
    });
    expect(
      screen
        .getByRole('tab', { name: 'Instagram' })
        .getAttribute('aria-selected')
    ).toBe('true');
    expect(document.activeElement).toBe(
      screen.getByRole('tab', { name: 'Instagram' })
    );
    expect(
      within(screen.getByRole('tabpanel')).getByText('Instagram App ID')
    ).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(
      within(screen.getByRole('tabpanel')).getByRole('textbox', {
        name: 'Rascunho local Sistema',
      })
    ).toBeTruthy();
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(
      within(screen.getByRole('tabpanel')).getByText('Facebook App ID')
    ).toBeTruthy();
  });

  it.each([
    ['instagramAutomation=ig', 'Instagram'],
    ['facebookAutomation=fb', 'Facebook'],
    ['metaTab=messenger&facebookAutomation=fb', 'Messenger'],
    ['metaTab=system-user', 'Usuário de sistema'],
  ])('abre a aba do link direto %s', (params, title) => {
    state.params = params;
    render(<MetaCredentialsCard configured onMutate={vi.fn()} />);
    expect(
      screen.getByRole('tab', { name: title }).getAttribute('aria-selected')
    ).toBe('true');
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('navega entre Facebook e Messenger sem enviar nem salvar credenciais', () => {
    openCard(false);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir Messenger' }));
    expect(
      screen.queryByRole('button', { name: 'Salvar credenciais' })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao Facebook' }));
    expect(
      screen
        .getByRole('tab', { name: 'Facebook' })
        .getAttribute('aria-selected')
    ).toBe('true');
    expect(state.fetch.mock.calls.every((call) => !call[1]?.method)).toBe(true);
  });

  it('preserva os campos da configuracao inicial ao alternar produtos', () => {
    openCard(false);
    fireEvent.change(screen.getByPlaceholderText('Cole o App ID do Facebook'), {
      target: { value: 'draft-facebook' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Threads' }));
    fireEvent.change(
      screen.getByPlaceholderText('Threads App ID do Meta Developer Portal'),
      { target: { value: 'draft-threads' } }
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Facebook' }));
    expect(
      (screen.getByDisplayValue('draft-facebook') as HTMLInputElement).value
    ).toBe('draft-facebook');
    fireEvent.click(screen.getByRole('tab', { name: 'Threads' }));
    expect(
      (
        within(screen.getByRole('tabpanel')).getByDisplayValue(
          'draft-threads'
        ) as HTMLInputElement
      ).value
    ).toBe('draft-threads');
    expect(
      screen.getAllByRole('button', { name: 'Salvar credenciais' })
    ).toHaveLength(1);
  });

  it('preserva a edicao da credencial e o estado local do Instagram sem salvar', () => {
    openCard();
    fireEvent.click(screen.getByRole('tab', { name: 'Instagram' }));
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Rascunho local Instagram' }),
      { target: { value: 'draft-local' } }
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Facebook' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByPlaceholderText('Cole o App ID do Facebook'), {
      target: { value: 'draft-edit' },
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Instagram' }));
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Rascunho local Instagram',
        }) as HTMLInputElement
      ).value
    ).toBe('draft-local');
    fireEvent.click(screen.getByRole('tab', { name: 'Facebook' }));
    expect(
      within(screen.getByRole('tabpanel')).getByDisplayValue('draft-edit')
    ).toBeTruthy();
    expect(state.fetch.mock.calls.every((call) => !call[1]?.method)).toBe(true);
  });
});

it('separa o usuario de sistema do Instagram e preserva ambos os rascunhos', () => {
  openCard();
  fireEvent.click(screen.getByRole('tab', { name: 'Usuário de sistema' }));
  expect(
    screen.queryByRole('textbox', { name: 'Rascunho local Instagram' })
  ).toBeNull();
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Rascunho local Sistema' }),
    { target: { value: 'system-draft' } }
  );
  fireEvent.click(screen.getByRole('tab', { name: 'Instagram' }));
  expect(
    screen.queryByRole('textbox', { name: 'Rascunho local Sistema' })
  ).toBeNull();
  fireEvent.click(screen.getByRole('tab', { name: 'Usuário de sistema' }));
  expect(
    (
      screen.getByRole('textbox', {
        name: 'Rascunho local Sistema',
      }) as HTMLInputElement
    ).value
  ).toBe('system-draft');
  expect(
    screen.queryByRole('button', { name: 'Salvar credenciais' })
  ).toBeNull();
  expect(state.fetch.mock.calls.every((call) => !call[1]?.method)).toBe(true);
});
it('ajuda do Instagram usa o mesmo drawer sem validar ou salvar', () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  openCard();
  fireEvent.click(screen.getByRole('tab', { name: 'Instagram' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajuda' }));
  const drawer = screen.getByRole('dialog', { name: 'Ajuda · Instagram' });
  expect(
    within(drawer).getByRole('tab', { name: 'Como configurar' })
  ).toBeTruthy();
  fireEvent.click(within(drawer).getByRole('tab', { name: 'Diagnóstico' }));
  expect(within(drawer).getByText('Token metadata')).toBeTruthy();
  expect(state.fetch.mock.calls.every((call) => !call[1]?.method)).toBe(true);
});

it('diagnostico dos tokens nao depende do App ID Instagram estar salvo localmente', () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  state.credential.data.instagramAppId = '';
  openCard();
  fireEvent.click(screen.getByRole('tab', { name: 'Instagram' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajuda' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Diagnóstico' }));
  expect(screen.getByText('Token metadata')).toBeTruthy();
  expect(screen.queryByText('meta_credentials_save_first')).toBeNull();
});

it('abre usuario de sistema pela ajuda do Instagram sem perder rascunho ou gravar', () => {
  openCard();
  fireEvent.click(screen.getByRole('tab', { name: 'Instagram' }));
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Rascunho local Instagram' }),
    {
      target: { value: 'instagram-draft' },
    }
  );
  fireEvent.click(screen.getByRole('button', { name: 'Ajuda' }));
  const drawer = screen.getByRole('dialog', { name: 'Ajuda · Instagram' });
  expect(
    (within(drawer).getByRole('radio', {
      name: 'meta_instagram_guide_account',
    }) as HTMLInputElement).checked
  ).toBe(true);
  expect(within(drawer).queryByText('meta_instagram_system_limit')).toBeNull();
  fireEvent.click(within(drawer).getByRole('radio', { name: 'meta_system_tab' }));
  expect(within(drawer).getByText('meta_instagram_system_limit')).toBeTruthy();
  fireEvent.click(
    within(drawer).getByRole('button', { name: 'fb_system_open' })
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  const tab = screen.getByRole('tab', { name: 'Usuário de sistema' });
  expect(tab.getAttribute('aria-selected')).toBe('true');
  expect(document.activeElement).toBe(tab);
  fireEvent.click(screen.getByRole('tab', { name: 'Instagram' }));
  expect(screen.getByDisplayValue('instagram-draft')).toBeTruthy();
  expect(state.fetch.mock.calls.every((call) => !call[1]?.method)).toBe(true);
});

it('alterna somente as instrucoes do Instagram e retorna ao token da conta', () => {
  openCard();
  fireEvent.click(screen.getByRole('tab', { name: 'Instagram' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ajuda' }));
  const drawer = within(screen.getByRole('dialog', { name: 'Ajuda · Instagram' }));
  const callsBeforeSwitch = state.fetch.mock.calls.length;
  expect(drawer.getByText('meta_instagram_guide_3_text')).toBeTruthy();
  fireEvent.click(drawer.getByRole('radio', { name: 'meta_system_tab' }));
  expect(drawer.queryByText('meta_instagram_guide_3_text')).toBeNull();
  expect(drawer.getByText('meta_instagram_system_support')).toBeTruthy();
  expect(drawer.getByText('meta_instagram_system_limit')).toBeTruthy();
  expect(drawer.getByText('meta_instagram_system_assets_text')).toBeTruthy();
  expect(drawer.getByText('meta_instagram_system_save_text')).toBeTruthy();
  fireEvent.click(drawer.getByRole('radio', { name: 'meta_instagram_guide_account' }));
  expect(drawer.getByText('meta_instagram_guide_3_text')).toBeTruthy();
  expect(drawer.queryByText('meta_instagram_system_limit')).toBeNull();
  expect(drawer.queryByRole('button', { name: 'fb_system_open' })).toBeNull();
  expect(state.fetch.mock.calls).toHaveLength(callsBeforeSwitch);
});

// Credential checks are read-only; feedback must stay beside their action.
it('mostra progresso e resultado local ao testar credenciais', async () => {
  let finish!: (value: unknown) => void;
  state.fetch.mockImplementation((path: string) =>
    path.includes('/test?')
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve({
          ok: true,
          json: async () => ({ callbackUrl: '/webhook' }),
        })
  );
  openCard();
  fireEvent.click(screen.getByRole('button', { name: 'Testar credenciais' }));
  const pending = screen.getByRole('button', { name: 'meta_action_testing' });
  expect(pending.getAttribute('aria-busy')).toBe('true');
  expect((pending as HTMLButtonElement).disabled).toBe(true);
  finish({ ok: true, json: async () => ({ ok: true }) });
  const result = await screen.findByRole('status');
  expect(result.textContent).toContain('meta_credentials_test_ok');
  expect(
    result.compareDocumentPosition(screen.getByText('Facebook App ID')) &
      Node.DOCUMENT_POSITION_FOLLOWING
  ).toBeTruthy();
});
it('nao apresenta sucesso nem corpo bruto em falha HTTP do teste', async () => {
  state.fetch.mockImplementation((path: string) =>
    Promise.resolve(
      path.includes('/test?')
        ? {
            ok: false,
            json: async () => ({ ok: true, error: 'sensitive response' }),
          }
        : { ok: true, json: async () => ({ callbackUrl: '/webhook' }) }
    )
  );
  openCard();
  fireEvent.click(screen.getByRole('button', { name: 'Testar credenciais' }));
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain(
      'Erro ao testar conexão'
    )
  );
  expect(screen.queryByText('sensitive response')).toBeNull();
});
it('salvar preserva dados das demais secoes e exibe falha de rede no formulario', async () => {
  openCard();
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  state.fetch.mockRejectedValueOnce(Error('private data'));
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
  expect(
    screen
      .getByRole('button', { name: 'meta_action_saving' })
      .getAttribute('aria-busy')
  ).toBe('true');
  expect(
    (screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement)
      .disabled
  ).toBe(true);
  const error = await screen.findByRole('alert');
  expect(error.textContent).toBe('credentials_save_error');
  expect(screen.queryByText('private data')).toBeNull();
  const body = JSON.parse(
    state.fetch.mock.calls.find(([, init]) => init?.method === 'PATCH')![1].body
  );
  expect(body.instagramAppId).toBe('__REDACTED__');
  expect(body.threadsAppSecret).toBe('__REDACTED__');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('alert')).toBeNull();
});
it('salvamento confirmado continua sucesso quando a releitura falha', async () => {
  openCard();
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  state.fetch.mockResolvedValueOnce({ ok: true });
  state.mutate.mockRejectedValueOnce(Error('refresh failed'));
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
  expect((await screen.findByRole('status')).textContent).toBe(
    'credentials_saved'
  );
  expect(screen.queryByRole('alert')).toBeNull();
});
it('remocao confirmada mostra progresso e erro sem limpar as outras secoes', async () => {
  let finish!: (value: unknown) => void;
  openCard();
  state.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
  expect(
    (
      await screen.findByRole('button', { name: 'meta_action_removing' })
    ).getAttribute('aria-busy')
  ).toBe('true');
  finish({ ok: false });
  expect((await screen.findByRole('alert')).textContent).toBe(
    'credentials_remove_error'
  );
  const body = JSON.parse(
    state.fetch.mock.calls.find(([, init]) => init?.method === 'PATCH')![1].body
  );
  expect(body.clientId).toBe('');
  expect(body.instagramAppId).toBe('__REDACTED__');
});
it.each(['Instagram', 'Threads'])(
  'erro do cadastro inicial permanece visivel na aba %s',
  async (tab) => {
    openCard(false);
    fireEvent.click(screen.getByRole('tab', { name: tab }));
    state.fetch.mockRejectedValueOnce(Error('network'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar credenciais' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'credentials_save_error'
    );
  }
);
