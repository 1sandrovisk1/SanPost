import React from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  act,
  waitFor,
} from '@testing-library/react';
import { SWRConfig } from 'swr';
import { FacebookAutomationSetup } from './facebook-automation-setup.component';
import type { FacebookSetupView } from '@gitroom/nestjs-libraries/dtos/integrations/facebook-automation.dto';

const state = vi.hoisted(() => ({
  fetch: vi.fn(),
  query: 'facebookAutomation=fb',
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(state.query),
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string, options?: { date?: string }) =>
    `${key}${options?.date ? ` ${options.date}` : ''}`,
  useTranslationSettings: () => ({ resolvedLanguage: 'pt' }),
}));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => state.fetch,
}));
vi.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({
    id: 'user',
    orgId: 'org',
    profileId: 'profile',
    role: 'ADMIN',
  }),
}));
vi.mock('./facebook-private-reply-test.component', () => ({
  FacebookPrivateReplyTest: ({ integrationId }: { integrationId: string }) => (
    <div>proof:{integrationId}</div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  state.query = 'facebookAutomation=fb';
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(cleanup);

const pageChoices = [
  { id: 'fb', pageId: '123', name: 'Pagina A' },
  { id: 'fb2', pageId: '789', name: 'Pagina B' },
];
const pageView = (id: string): FacebookSetupView => ({
  authorized: true,
  integrationId: id,
  appId: '456',
  pageId: id === 'fb' ? '123' : '789',
  callbackUrl: 'https://example.com/hook',
  verifyToken: null,
  status: null,
  receipt: null,
});
const ok = (body: unknown) => ({ ok: true, json: async () => body });

function openUnselectedDiagnostic() {
  state.query = '';
  const onHelpChange = vi.fn();
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={vi.fn()}
        helpOpen
        onHelpChange={onHelpChange}
      />
    </SWRConfig>
  );
  fireEvent.click(screen.getByRole('tab', { name: 'meta_help_diagnostics' }));
  return { dialog: screen.getByRole('dialog'), onHelpChange };
}

it('seleciona dentro do diagnostico sem fechar ou perder foco e ignora resposta da Pagina anterior', async () => {
  let finishA!: (value: unknown) => void;
  let finishB!: (value: unknown) => void;
  state.fetch.mockImplementation((path: string) => {
    if (path === '/facebook-automations')
      return Promise.resolve(ok(pageChoices));
    return new Promise((resolve) => {
      if (path === '/facebook-automations/fb') finishA = resolve;
      else if (path === '/facebook-automations/fb2') finishB = resolve;
      else throw new Error('Unexpected request');
    });
  });
  const { dialog, onHelpChange } = openUnselectedDiagnostic();
  const selector = await within(dialog).findByRole('combobox');
  selector.focus();
  fireEvent.change(selector, { target: { value: 'fb' } });
  expect(within(dialog).getByText('loading')).toBeTruthy();
  expect(document.activeElement).toBe(selector);
  fireEvent.change(selector, { target: { value: 'fb2' } });
  await act(async () => finishA(ok(pageView('fb'))));
  expect(within(dialog).queryByText('proof:fb')).toBeNull();
  expect(within(dialog).getByText('loading')).toBeTruthy();
  await act(async () => finishB(ok(pageView('fb2'))));
  expect(
    await within(dialog).findByRole('heading', { name: 'Pagina B' })
  ).toBeTruthy();
  expect(within(dialog).getByText('proof:fb2')).toBeTruthy();
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(document.activeElement).toBe(selector);
  expect(
    within(dialog)
      .getByRole('tab', { name: 'meta_help_diagnostics' })
      .getAttribute('aria-selected')
  ).toBe('true');
  const selects = Array.from(document.querySelectorAll('select'));
  expect(selects.map((select) => select.value)).toEqual(['fb2', 'fb2']);
  expect(new Set(selects.map((select) => select.name)).size).toBe(2);
  fireEvent.change(selector, { target: { value: '' } });
  expect(within(dialog).queryByText('proof:fb2')).toBeNull();
  expect(
    within(dialog).queryByRole('heading', { name: 'Pagina B' })
  ).toBeNull();
  expect(document.activeElement).toBe(selector);
  expect(onHelpChange).not.toHaveBeenCalled();
  expect(
    state.fetch.mock.calls.every(
      ([, options]) => !options?.method || options.method === 'GET'
    )
  ).toBe(true);
});

it('mostra erro e permite tentar novamente na lateral sem exibir a Pagina anterior', async () => {
  let failed = true;
  state.fetch.mockImplementation(async (path: string) => {
    if (path === '/facebook-automations') return ok(pageChoices);
    if (path === '/facebook-automations/fb2' && failed)
      throw new Error('offline');
    return ok(pageView(path.endsWith('/fb2') ? 'fb2' : 'fb'));
  });
  const { dialog } = openUnselectedDiagnostic();
  const selector = await within(dialog).findByRole('combobox');
  fireEvent.change(selector, { target: { value: 'fb' } });
  await within(dialog).findByText('proof:fb');
  fireEvent.change(selector, { target: { value: 'fb2' } });
  await within(dialog).findByText('fb_auto_error');
  expect(within(dialog).queryByText('proof:fb')).toBeNull();
  expect(
    within(dialog).queryByRole('heading', { name: 'Pagina A' })
  ).toBeNull();
  failed = false;
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'fb_auto_retry' })
  );
  expect(await within(dialog).findByText('proof:fb2')).toBeTruthy();
  await waitFor(() =>
    expect(within(dialog).queryByText('fb_auto_error')).toBeNull()
  );
  expect(
    state.fetch.mock.calls.every(
      ([, options]) => !options?.method || options.method === 'GET'
    )
  ).toBe(true);
});

it('explica quando o perfil nao tem Paginas conectadas dentro do diagnostico', async () => {
  state.fetch.mockResolvedValue(ok([]));
  const { dialog } = openUnselectedDiagnostic();
  expect(await within(dialog).findByText('fb_auto_no_pages')).toBeTruthy();
  expect(within(dialog).queryByRole('combobox')).toBeNull();
  expect(state.fetch).toHaveBeenCalledExactlyOnceWith('/facebook-automations', {
    cache: 'no-store',
  });
});

it('falha tardia de tentar novamente nao contamina outra Pagina selecionada', async () => {
  let firstRead = true;
  let rejectRetry!: (reason: Error) => void;
  state.fetch.mockImplementation((path: string) => {
    if (path === '/facebook-automations')
      return Promise.resolve(ok(pageChoices));
    if (path === '/facebook-automations/fb2')
      return Promise.resolve(ok(pageView('fb2')));
    if (firstRead) {
      firstRead = false;
      return Promise.reject(new Error('offline'));
    }
    return new Promise((_, reject) => {
      rejectRetry = reject;
    });
  });
  const { dialog } = openUnselectedDiagnostic();
  const selector = await within(dialog).findByRole('combobox');
  fireEvent.change(selector, { target: { value: 'fb' } });
  await within(dialog).findByText('fb_auto_error');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'fb_auto_retry' })
  );
  await waitFor(() => expect(rejectRetry).toBeTypeOf('function'));
  fireEvent.change(selector, { target: { value: 'fb2' } });
  await within(dialog).findByRole('heading', { name: 'Pagina B' });
  await act(async () => rejectRetry(new Error('still offline')));
  expect(within(dialog).queryByText('fb_auto_error')).toBeNull();
  expect(within(dialog).getByText('proof:fb2')).toBeTruthy();
});

it('revalida o diagnostico persistido sem apresentar sucesso antigo na falha', async () => {
  const previous = '2026-10-25T22:00:00Z';
  const failed = {
    stage: 'CHECK_FAILED',
    checkedAt: '2026-10-25T23:00:00Z',
    reasons: ['META_CHECK_FAILED'],
    missingPermissions: [] as string[],
    automaticRepliesAvailable: false,
  };
  let checked = false;
  let detailReads = 0;
  state.fetch.mockImplementation(
    async (path: string, options?: { method?: string }) => {
      let body: unknown;
      if (path === '/facebook-automations') {
        body = [{ id: 'fb', pageId: '123', name: 'Pagina' }];
      } else if (
        path === '/facebook-automations/fb/check' &&
        options?.method === 'POST'
      ) {
        checked = true;
        body = failed;
      } else if (path === '/facebook-automations/fb') {
        detailReads++;
        body = {
          authorized: true,
          integrationId: 'fb',
          appId: '456',
          pageId: '123',
          receipt: null,
          status: checked
            ? { ...failed, lastReadyAt: previous }
            : {
                ...failed,
                stage: 'RECEIVING_READY',
                checkedAt: previous,
                lastReadyAt: previous,
              },
        };
      } else throw new Error('Unexpected request');
      return { ok: true, json: async () => body };
    }
  );
  render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={vi.fn()}
      />
    </SWRConfig>
  );
  fireEvent.click(
    await screen.findByRole('button', { name: 'fb_auto_check_page' })
  );
  await screen.findByText('fb_auto_status_check_failed');
  expect(detailReads).toBe(2);
  expect(screen.queryByText('fb_auto_ready_compact')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
  fireEvent.click(screen.getByRole('tab', { name: 'meta_help_diagnostics' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('meta_diagnostic_last_ready')).toBeTruthy();
  expect(within(dialog).queryByText('fb_auto_ready_compact')).toBeNull();
});
