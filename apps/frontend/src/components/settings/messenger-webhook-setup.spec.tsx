import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { SWRConfig } from 'swr';

// JSDOM models dialog state only; focus containment is verified in the real browser.
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.open = true;
});
const closeDialog = vi.fn(function (this: HTMLDialogElement) {
  this.open = false;
});
import { MessengerWebhookSetup } from './messenger-webhook-setup.component';
const state = vi.hoisted(() => ({
  fetch: vi.fn(),
  profileId: 'profile',
  role: 'ADMIN',
}));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => state.fetch,
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
vi.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({
    orgId: 'org',
    profileId: state.profileId,
    role: state.role,
  }),
}));
const view = {
  appId: '456',
  callbackUrl: 'https://example.com/public/facebook-automations/456',
  verifyToken: 'VERIFY',
  authorizationRequired: false,
};
function mount() {
  const back = vi.fn();
  const ui = (
    <SWRConfig value={{ provider: () => new Map() }}>
      <MessengerWebhookSetup credentialVersion="v1" onOpenFacebook={back} />
    </SWRConfig>
  );
  return { ...render(ui), back, ui };
}
beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: showModal,
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: closeDialog,
  });
  state.role = 'ADMIN';
  state.profileId = 'profile';
  state.fetch.mockResolvedValue({ ok: true, json: async () => view });
});
afterEach(cleanup);
describe('webhook compartilhado na aba Messenger', () => {
  it('le dados do aplicativo sem pagina e copia token oculto sem ativar', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const { back } = mount();
    const input = await screen.findByLabelText('fb_auto_verify');
    expect(input.getAttribute('type')).toBe('password');
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('fb_auto_meta_path')).toBeNull();
    expect(screen.getByRole('button', { name: 'meta_help' })).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'fb_auto_copy' })[1]);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('VERIFY'));
    fireEvent.click(
      screen.getByRole('button', { name: 'messenger_manage_pages' })
    );
    expect(back).toHaveBeenCalledOnce();
    expect(state.fetch).toHaveBeenCalledWith(
      '/facebook-automations/app/webhook',
      { cache: 'no-store' }
    );
    expect(state.fetch.mock.calls.every((call) => !call[1]?.method)).toBe(true);
  });
  it('permite copiar os mesmos dados no guia sem fazer mutacoes', async () => {
    const copy = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: copy },
    });
    mount();
    const trigger = await screen.findByRole('button', {
      name: 'meta_help',
    });
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', {
      name: 'meta_help · Messenger',
    });
    expect(showModal).toHaveBeenCalledOnce();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(4);
    expect(within(dialog).getByText('fb_auto_meta_path')).toBeTruthy();
    expect(
      within(dialog).getByText('fb_auto_shared_webhook_notice')
    ).toBeTruthy();
    expect(
      (within(dialog).getByLabelText('fb_auto_callback') as HTMLInputElement)
        .value
    ).toBe(view.callbackUrl);
    expect(
      within(dialog).getByLabelText('fb_auto_verify').getAttribute('type')
    ).toBe('password');
    fireEvent.click(
      within(dialog).getAllByRole('button', { name: 'fb_auto_copy' })[1]
    );
    await waitFor(() => expect(copy).toHaveBeenCalledWith(view.verifyToken));
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(
      within(dialog)
        .getByRole('link', { name: 'fb_auto_meta_open_short' })
        .getAttribute('href')
    ).toBe('https://developers.facebook.com/apps/456/dashboard/');
    fireEvent.click(within(dialog).getByText('fb_auto_meta_path_help'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'meta_help_back' })
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(closeDialog).toHaveBeenCalledOnce();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(state.fetch.mock.calls.every((call) => !call[1]?.method)).toBe(true);
  });
  it.each(['escape', 'close', 'backdrop', 'unmount'])(
    'fecha o drawer por %s',
    async (method) => {
      const { unmount } = mount();
      fireEvent.click(await screen.findByRole('button', { name: 'meta_help' }));
      const dialog = screen.getByRole('dialog');
      if (method === 'escape')
        fireEvent(dialog, new Event('cancel', { cancelable: true }));
      if (method === 'close')
        fireEvent.click(within(dialog).getByRole('button', { name: 'close' }));
      if (method === 'backdrop') {
        fireEvent.pointerDown(dialog);
        fireEvent.pointerUp(dialog);
        fireEvent.click(dialog);
      }
      if (method === 'unmount') unmount();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(closeDialog).toHaveBeenCalledOnce();
      expect(state.fetch.mock.calls.every((call) => !call[1]?.method)).toBe(
        true
      );
    }
  );
  it('mantem Tab e Shift+Tab dentro do guia nos limites da navegacao', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'meta_help' }));
    const dialog = screen.getByRole('dialog');
    const first = within(dialog).getByRole('button', { name: 'close' });
    const last = within(dialog).getByRole('button', {
      name: 'meta_help_back',
    });
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    expect(state.fetch.mock.calls.every((call) => !call[1]?.method)).toBe(true);
  });
  it.each(['outside-inside', 'inside-outside'])(
    'nao fecha ao arrastar entre guia e backdrop: %s',
    async (direction) => {
      mount();
      fireEvent.click(await screen.findByRole('button', { name: 'meta_help' }));
      const dialog = screen.getByRole('dialog');
      const content = within(dialog).getByText('fb_auto_meta_path');
      fireEvent.pointerDown(direction === 'outside-inside' ? dialog : content);
      fireEvent.pointerUp(direction === 'outside-inside' ? content : dialog);
      fireEvent.click(dialog);
      expect(screen.getByRole('dialog')).toBeTruthy();
    }
  );
  it('mantem o drawer aberto no StrictMode e sincroniza fechamento nativo', async () => {
    render(
      <StrictMode>
        <SWRConfig value={{ provider: () => new Map() }}>
          <MessengerWebhookSetup
            credentialVersion="v1"
            onOpenFacebook={vi.fn()}
          />
        </SWRConfig>
      </StrictMode>
    );
    fireEvent.click(await screen.findByRole('button', { name: 'meta_help' }));
    const dialog = screen.getByRole('dialog') as HTMLDialogElement;
    expect(dialog.open).toBe(true);
    fireEvent(dialog, new Event('close'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    dialog.open = false;
    fireEvent(dialog, new Event('close'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('oferece tooltips para aplicativo e callback sem expor instrucoes na aba', async () => {
    mount();
    await screen.findByLabelText('fb_auto_callback');
    fireEvent.focus(
      screen.getByRole('button', { name: 'messenger_app_help_label' })
    );
    expect(await screen.findByRole('tooltip')).toBeTruthy();
    expect(screen.getByText('messenger_app_help')).toBeTruthy();
    fireEvent.blur(
      screen.getByRole('button', { name: 'messenger_app_help_label' })
    );
    fireEvent.focus(
      screen.getByRole('button', { name: 'messenger_callback_help_label' })
    );
    expect(await screen.findByText('messenger_callback_help')).toBeTruthy();
  });
  it('orienta autorizar uma pagina antes de disponibilizar o token', async () => {
    state.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...view,
        verifyToken: null as string | null,
        authorizationRequired: true,
      }),
    });
    const { back } = mount();
    expect(
      await screen.findByText('messenger_authorization_hint')
    ).toBeTruthy();
    expect(screen.queryByLabelText('fb_auto_verify')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'messenger_authorize_facebook' })
    );
    expect(back).toHaveBeenCalledOnce();
  });
  it('trata precondicao e permite tentar novamente sem divulgar erro tecnico', async () => {
    state.fetch.mockResolvedValue({ ok: false, status: 412 });
    mount();
    expect(await screen.findByText('messenger_prerequisite')).toBeTruthy();
    state.fetch.mockResolvedValue({ ok: true, json: async () => view });
    fireEvent.click(screen.getByRole('button', { name: 'fb_auto_retry' }));
    expect(await screen.findByLabelText('fb_auto_callback')).toBeTruthy();
  });
  it('nao carrega dados para usuario sem permissao', () => {
    state.role = 'USER';
    mount();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it.each(['profile', 'credential'])(
    'isola cache quando muda %s',
    async (change) => {
      const cache = new Map();
      const ui = (version: string) => (
        <SWRConfig value={{ provider: () => cache }}>
          <MessengerWebhookSetup
            credentialVersion={version}
            onOpenFacebook={vi.fn()}
          />
        </SWRConfig>
      );
      const { rerender } = render(ui('v1'));
      await screen.findByLabelText('fb_auto_verify');
      state.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ ...view, appId: '789', verifyToken: 'OTHER' }),
      });
      if (change === 'profile') state.profileId = 'other';
      rerender(ui(change === 'credential' ? 'v2' : 'v1'));
      await waitFor(() =>
        expect(
          (screen.getByLabelText('fb_auto_verify') as HTMLInputElement).value
        ).toBe('OTHER')
      );
      expect(state.fetch).toHaveBeenCalledTimes(2);
    }
  );
  it('revalida ao reabrir a aba depois de uma autorizacao', async () => {
    const cache = new Map();
    state.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        ...view,
        verifyToken: null as string | null,
        authorizationRequired: true,
      }),
    });
    const ui = (open: boolean) => (
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        {open && (
          <MessengerWebhookSetup
            credentialVersion="v1"
            onOpenFacebook={vi.fn()}
          />
        )}
      </SWRConfig>
    );
    const { rerender } = render(ui(true));
    await screen.findByText('messenger_authorization_hint');
    rerender(ui(false));
    state.fetch.mockResolvedValue({ ok: true, json: async () => view });
    rerender(ui(true));
    expect(await screen.findByLabelText('fb_auto_verify')).toBeTruthy();
  });
});

it('diagnostico do Messenger diferencia valores disponiveis de verificacao Meta', async () => {
  const { back } = mount();
  fireEvent.click(await screen.findByRole('button', { name: 'meta_help' }));
  fireEvent.click(screen.getByRole('tab', { name: 'meta_help_diagnostics' }));
  expect(screen.getByText('meta_messenger_values_available')).toBeTruthy();
  expect(screen.getByText('meta_diagnostic_webhook_unverified')).toBeTruthy();
  expect(screen.getByDisplayValue('456').closest('details')?.open).toBe(false);
  expect(screen.queryByText('fb_auto_meta_path')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'meta_diagnostic_open_facebook' })
  );
  expect(back).toHaveBeenCalledOnce();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(state.fetch.mock.calls.every((call) => !call[1]?.method)).toBe(true);
});
