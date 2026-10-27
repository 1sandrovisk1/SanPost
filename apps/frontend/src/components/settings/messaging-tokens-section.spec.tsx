import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  MessagingTokensProvider,
  MessagingTokensSection,
  MessagingTokensDiagnostics,
} from './messaging-tokens-section.component';
const state = vi.hoisted(() => ({ fetch: vi.fn(), profile: 'one' }));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => state.fetch,
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
  useTranslationSettings: () => ({ resolvedLanguage: 'pt' }),
}));
vi.mock('@gitroom/react/toaster/toaster', () => ({
  useToaster: () => ({ show: vi.fn() }),
}));
vi.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({ orgId: 'org', profileId: state.profile, role: 'ADMIN' }),
}));
const stored = {
  hasSystemToken: true,
  systemTokenValidatedAt: '2026-10-20T12:00:00Z',
  systemTokenInfo: {
    businessName: 'Business',
    pages: [{ id: 'page', name: 'Page' }],
  },
  instagramTokens: [
    {
      igUserId: 'ig-one',
      username: 'one',
      hasToken: true,
      refreshedAt: '2026-10-20T12:00:00Z',
    },
  ],
};
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
const scopeHeaders = {
  'x-expected-org-id': 'org',
  'x-expected-profile-id': 'one',
};
const ui = () => (
  <MessagingTokensProvider>
    <MessagingTokensSection section="instagram" />
    <MessagingTokensSection section="system-user" />
  </MessagingTokensProvider>
);
beforeEach(() => {
  vi.clearAllMocks();
  state.profile = 'one';
  state.fetch.mockResolvedValue(response(stored));
});
afterEach(cleanup);
it('diagnostico Instagram nao apresenta cadastro como renovacao confirmada', async () => {
  render(
    <MessagingTokensProvider>
      <MessagingTokensDiagnostics section="instagram" />
    </MessagingTokensProvider>
  );
  await screen.findByText('@one');
  expect(screen.getByText('meta_token_last_update')).toBeTruthy();
  expect(screen.queryByText('meta_token_last_refresh')).toBeNull();
  expect(screen.getByText('meta_token_added')).toBeTruthy();
  expect(state.fetch.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
it('diagnostico de sistema separa ativos de cadastro sem tutorial de ativacao', async () => {
  render(
    <MessagingTokensProvider>
      <MessagingTokensDiagnostics section="system-user" />
    </MessagingTokensProvider>
  );
  await screen.findByText('meta_token_added');
  expect(screen.getByText('meta_diagnostic_assets_notice')).toBeTruthy();
  expect(screen.getByText('meta_system_assets').closest('details')?.open).toBe(
    false
  );
  expect(screen.queryByText('meta_system_facebook_limit')).toBeNull();
  expect(state.fetch.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
it('compartilha uma leitura e remove apenas o token de sistema', async () => {
  render(ui());
  await screen.findByText('@one');
  expect(state.fetch).toHaveBeenCalledTimes(1);
  state.fetch.mockResolvedValue(
    response({ ...stored, hasSystemToken: false, systemTokenInfo: null })
  );
  fireEvent.click(screen.getByRole('button', { name: 'meta_system_remove' }));
  await waitFor(() =>
    expect(state.fetch).toHaveBeenCalledWith(
      '/credentials/facebook/messaging-tokens',
      {
        method: 'POST',
        headers: scopeHeaders,
        body: JSON.stringify({ metaSystemUserToken: '' }),
      }
    )
  );
  expect(screen.getByText('@one')).toBeTruthy();
});
it('adiciona Instagram mantendo contas existentes e sem enviar token de sistema', async () => {
  render(ui());
  await screen.findByText('@one');
  fireEvent.click(
    screen.getByRole('button', { name: 'meta_instagram_tokens_add' })
  );
  fireEvent.change(screen.getByLabelText('meta_instagram_tokens_label'), {
    target: { value: 'new-ig-token' },
  });
  state.fetch
    .mockResolvedValueOnce(
      response({ ok: true, igUserId: 'ig-two', username: 'two' })
    )
    .mockResolvedValueOnce(
      response({
        ...stored,
        instagramTokens: [
          ...stored.instagramTokens,
          { igUserId: 'ig-two', username: 'two' },
        ],
      })
    );
  fireEvent.click(screen.getByRole('button', { name: 'validate_and_save' }));
  await screen.findByText('@two');
  const payload = JSON.parse(
    state.fetch.mock.calls.find(
      ([path, init]) =>
        path === '/credentials/facebook/messaging-tokens' &&
        init?.method === 'POST'
    )![1].body
  );
  expect(Object.keys(payload)).toEqual(['instagramTokens']);
  expect(payload.instagramTokens[0]).toEqual(stored.instagramTokens[0]);
  expect(payload.instagramTokens[1]).toEqual({
    igUserId: 'ig-two',
    username: 'two',
    token: 'new-ig-token',
  });
});
it('limpar Instagram preserva usuario de sistema', async () => {
  render(ui());
  await screen.findByText('@one');
  state.fetch.mockResolvedValue(response({ ...stored, instagramTokens: [] }));
  fireEvent.click(
    screen.getByRole('button', { name: 'meta_instagram_tokens_clear_all' })
  );
  await waitFor(() =>
    expect(state.fetch).toHaveBeenCalledWith(
      '/credentials/facebook/messaging-tokens',
      {
        method: 'POST',
        headers: scopeHeaders,
        body: JSON.stringify({ instagramTokens: [] }),
      }
    )
  );
  expect(
    screen.getByRole('button', { name: 'meta_system_remove' })
  ).toBeTruthy();
});
it('falha de leitura nao vira ausencia de token e diagnostico nao valida na Meta', async () => {
  state.fetch.mockResolvedValue(response({}, false));
  render(
    <MessagingTokensProvider>
      <MessagingTokensDiagnostics section="system-user" />
    </MessagingTokensProvider>
  );
  await screen.findByText('meta_tokens_unavailable');
  expect(screen.queryByText('meta_token_not_added')).toBeNull();
  expect(state.fetch.mock.calls.every(([, init]) => !init?.method)).toBe(true);
});
it('descarta leitura tardia e rascunho ao trocar perfil', async () => {
  let finish: (value: unknown) => void = () => {};
  state.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const page = render(ui());
  state.profile = 'two';
  state.fetch.mockResolvedValue(
    response({
      ...stored,
      instagramTokens: [{ igUserId: 'ig-two', username: 'two' }],
    })
  );
  page.rerender(ui());
  await screen.findByText('@two');
  finish(response(stored));
  await waitFor(() => expect(screen.queryByText('@one')).toBeNull());
});
it('salva usuario de sistema apenas no escopo exibido sem reenviar os tokens Instagram', async () => {
  state.fetch.mockResolvedValue(response({ ...stored, hasSystemToken: false }));
  render(ui());
  await screen.findByText('@one');
  expect(state.fetch).toHaveBeenCalledWith(
    '/credentials/facebook/messaging-tokens',
    { headers: scopeHeaders }
  );
  fireEvent.change(screen.getByLabelText('meta_system_user_token_label'), {
    target: { value: 'system-token' },
  });
  state.fetch.mockResolvedValue(response(stored));
  fireEvent.click(screen.getByRole('button', { name: 'validate_and_save' }));
  await screen.findByRole('button', { name: 'meta_system_remove' });
  expect(state.fetch).toHaveBeenLastCalledWith(
    '/credentials/facebook/messaging-tokens',
    {
      method: 'POST',
      headers: scopeHeaders,
      body: JSON.stringify({ metaSystemUserToken: 'system-token' }),
    }
  );
  expect(screen.getByText('@one')).toBeTruthy();
});
it('nao grava token Instagram se validacao termina apos troca de perfil', async () => {
  const page = render(ui());
  await screen.findByText('@one');
  fireEvent.click(
    screen.getByRole('button', { name: 'meta_instagram_tokens_add' })
  );
  fireEvent.change(screen.getByLabelText('meta_instagram_tokens_label'), {
    target: { value: 'new-token' },
  });
  let finish: (value: unknown) => void = () => {};
  state.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  fireEvent.click(screen.getByRole('button', { name: 'validate_and_save' }));
  state.profile = 'two';
  state.fetch.mockResolvedValue(response({ ...stored, instagramTokens: [] }));
  page.rerender(ui());
  await act(async () => {
    finish(response({ ok: true, igUserId: 'ig-new', username: 'new' }));
  });
  expect(
    state.fetch.mock.calls.filter(
      ([path, init]) =>
        path.endsWith('/messaging-tokens') && init?.method === 'POST'
    )
  ).toHaveLength(0);
});
it('mostra progresso somente na acao de token executada e resultado na mesma secao', async () => {
  render(ui());
  await screen.findByText('@one');
  let finish!: (value: unknown) => void;
  state.fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  fireEvent.click(screen.getByRole('button', { name: 'meta_system_remove' }));
  expect(
    screen
      .getByRole('button', { name: 'meta_action_removing' })
      .getAttribute('aria-busy')
  ).toBe('true');
  expect(
    screen.getByRole('button', { name: 'meta_instagram_tokens_clear_all' })
  ).toBeTruthy();
  finish(response({ ...stored, hasSystemToken: false, systemTokenInfo: null }));
  expect((await screen.findByRole('status')).textContent).toBe(
    'meta_token_removed'
  );
});
it('mantem falha de token visivel sem mostrar corpo bruto', async () => {
  render(ui());
  await screen.findByText('@one');
  state.fetch.mockRejectedValueOnce(Error('secret token'));
  fireEvent.click(screen.getByRole('button', { name: 'meta_system_remove' }));
  expect((await screen.findByRole('alert')).textContent).toBe(
    'meta_tokens_save_failed'
  );
  expect(screen.queryByText('secret token')).toBeNull();
});
