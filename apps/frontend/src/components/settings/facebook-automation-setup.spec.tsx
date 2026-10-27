import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  act,
} from '@testing-library/react';
import { FacebookAutomationSetup } from './facebook-automation-setup.component';
const state = vi.hoisted(() => ({
  fetch: vi.fn(),
  view: {} as any,
  proof: vi.fn(),
  openMessenger: vi.fn(),
  profileId: 'profile',
  mutate: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('facebookAutomation=fb'),
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
  useTranslationSettings: () => ({ resolvedLanguage: 'pt' }),
}));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => state.fetch,
}));
vi.mock('@gitroom/frontend/components/layout/user.context', () => ({
  useUser: () => ({
    id: 'user',
    orgId: 'org',
    profileId: state.profileId,
    role: 'ADMIN',
  }),
}));
vi.mock('./facebook-private-reply-test.component', () => ({
  FacebookPrivateReplyTest: () => {
    state.proof();
    return <div>proof</div>;
  },
}));
vi.mock('swr', () => ({
  default: (key: any) => ({
    data:
      key?.[1] === '/facebook-automations'
        ? [{ id: 'fb', name: 'Pagina', pageId: '123' }]
        : key
        ? state.view
        : undefined,
    mutate: state.mutate,
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.profileId = 'profile';
  state.mutate.mockImplementation(async (update?: (value: any) => any) => {
    if (update) state.view = update(state.view);
    return state.view;
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value: function () {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value: function () {
      this.open = false;
    },
  });
  state.view = {
    authorized: true,
    appId: '456',
    pageId: '123',
    callbackUrl: 'https://example.com/hook',
    verifyToken: 'VERIFY',
    status: null,
    receipt: null,
  };
  state.fetch.mockResolvedValue({
    ok: true,
    json: async () => checkedStatus(),
  });
});
afterEach(cleanup);

it('separa validade da Pagina e da origem sem tratar ambas como o mesmo token', () => {
  state.view.status = { ...checkedStatus(), noScheduledExpiry: true };
  state.view.authorization = {
    source: 'SYSTEM_USER',
    authorizedAt: '2026-10-25T20:00:00Z',
    tokenExpiresAt: '2026-12-01T12:00:00Z',
    dataAccessExpiresAt: '2027-01-01T12:00:00Z',
  };
  state.view.receipt = {
    receivedAt: '2026-10-25T21:00:00Z',
    postId: 'post-technical',
    commentId: 'comment-technical',
  };
  render(
    <FacebookAutomationSetup
      credentialVersion="v1"
      onOpenMessenger={state.openMessenger}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
  fireEvent.click(screen.getByRole('tab', { name: 'meta_help_diagnostics' }));
  const dialog = within(screen.getByRole('dialog'));
  expect(
    dialog.getByText('meta_diagnostic_page_expiry').parentElement?.textContent
  ).toContain('meta_diagnostic_no_expiry');
  const technical = dialog
    .getByText('meta_diagnostic_technical')
    .closest('details')!;
  expect(technical.open).toBe(false);
  expect(
    within(technical).getByText('meta_diagnostic_source_expiry').parentElement
      ?.textContent
  ).not.toContain('meta_diagnostic_no_expiry');
  expect(within(technical).getByDisplayValue('post-technical')).toBeTruthy();
  expect(dialog.getAllByText('meta_diagnostic_revocation')).toHaveLength(1);
  expect(state.fetch).not.toHaveBeenCalled();
});

it.each([
  null,
  {
    stage: 'CHECK_FAILED',
    checkedAt: '2026-10-25T23:00:00Z',
    missingPermissions: [],
  },
])(
  'nao usa a validade do usuario de sistema para preencher a validade desconhecida da Pagina (%s)',
  (status) => {
    state.view.status = status;
    state.view.authorization = {
      source: 'SYSTEM_USER',
      noScheduledExpiry: true,
    };
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
    fireEvent.click(screen.getByRole('tab', { name: 'meta_help_diagnostics' }));
    const dialog = within(screen.getByRole('dialog'));
    expect(
      dialog.getByText('meta_diagnostic_page_expiry').parentElement?.textContent
    ).toContain('meta_diagnostic_not_available');
    expect(
      dialog.getByText('meta_diagnostic_source_expiry').parentElement
        ?.textContent
    ).toContain('meta_diagnostic_no_expiry');
    expect(dialog.queryByText('fb_auto_ready_compact')).toBeNull();
  }
);

function checkedStatus(stage = 'RECEIVING_READY') {
  return {
    stage,
    checkedAt: '2026-10-25T23:00:00Z',
    missingPermissions: [] as string[],
    reasons: [] as string[],
    automaticRepliesAvailable: false,
  };
}

describe('feedback da verificacao da Pagina', () => {
  function openPage(stage = 'RECEIVING_READY') {
    state.view.status = checkedStatus(stage);
    return render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
  }

  it('mantem texto e progresso acessiveis sem duplicar a consulta', async () => {
    let finish!: (response: any) => void;
    state.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    openPage('CHECK_REQUIRED');
    fireEvent.click(screen.getByRole('button', { name: 'fb_auto_check_page' }));
    const button = screen.getByRole('button', {
      name: 'fb_auto_checking_page',
    });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.querySelector('.invisible')).toBeNull();
    expect(button.querySelector('[aria-hidden="true"]')).toBeTruthy();
    const activate = screen.getByRole('button', { name: 'fb_auto_activate' });
    expect((activate as HTMLButtonElement).disabled).toBe(true);
    expect(activate.querySelector('.invisible')).toBeNull();
    fireEvent.click(button);
    expect(state.fetch).toHaveBeenCalledExactlyOnceWith(
      '/facebook-automations/fb/check',
      { method: 'POST' }
    );
    fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
    fireEvent.click(screen.getByRole('tab', { name: 'meta_help_diagnostics' }));
    const selector = within(screen.getByRole('dialog')).getByRole(
      'combobox'
    ) as HTMLSelectElement;
    expect(selector.disabled).toBe(true);
    fireEvent.change(selector, { target: { value: '' } });
    expect(selector.value).toBe('fb');
    expect(
      (
        document.querySelector(
          'select[name="facebookAutomationPage"]'
        ) as HTMLSelectElement
      ).disabled
    ).toBe(true);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'meta_help_back',
      })
    );
    await act(async () =>
      finish({ ok: true, json: async () => checkedStatus() })
    );
    expect(await screen.findByText('fb_auto_check_success')).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'fb_auto_check_page' })
        .getAttribute('aria-busy')
    ).toBe('false');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it.each([
    'AUTHORIZATION_REQUIRED',
    'CALLBACK_REQUIRED',
    'CALLBACK_CONFLICT',
    'CHECK_REQUIRED',
    'CHECK_FAILED',
  ])(
    'HTTP 200 com %s mostra pendencia ou falha, sem sucesso antigo',
    async (stage) => {
      state.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => checkedStatus(stage),
      });
      openPage();
      fireEvent.click(
        screen.getByRole('button', { name: 'fb_auto_check_page' })
      );
      expect(
        await screen.findByText(`fb_auto_status_${stage.toLowerCase()}`)
      ).toBeTruthy();
      expect(screen.queryByText('fb_auto_check_success')).toBeNull();
      expect(screen.queryByText('fb_auto_ready_compact')).toBeNull();
      expect(
        screen.queryByRole('link', { name: 'shared_create_automation' })
      ).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    }
  );

  it.each(['network', 'invalid', 'cache'])(
    'falha %s limpa o sucesso anterior e deixa o erro na tela',
    async (failure) => {
      openPage();
      fireEvent.click(
        screen.getByRole('button', { name: 'fb_auto_check_page' })
      );
      await screen.findByText('fb_auto_check_success');
      if (failure === 'network')
        state.fetch.mockRejectedValueOnce(new Error('offline'));
      if (failure === 'invalid')
        state.fetch.mockResolvedValueOnce({
          ok: true,
          json: async () => ({ stage: 'RECEIVING_READY' }),
        });
      if (failure === 'cache')
        state.mutate.mockRejectedValueOnce(new Error('unavailable'));
      fireEvent.click(
        screen.getByRole('button', { name: 'fb_auto_check_page' })
      );
      expect(await screen.findByText('fb_auto_error')).toBeTruthy();
      expect(screen.queryByText('fb_auto_check_success')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    }
  );

  it('limpa feedback ao trocar a Pagina', async () => {
    openPage();
    fireEvent.click(screen.getByRole('button', { name: 'fb_auto_check_page' }));
    await screen.findByText('fb_auto_check_success');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fb' } });
    expect(screen.queryByText('fb_auto_check_success')).toBeNull();
  });

  it('ignora conclusao da verificacao ao trocar de perfil', async () => {
    let finish!: (response: any) => void;
    state.fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const { rerender } = openPage();
    fireEvent.click(screen.getByRole('button', { name: 'fb_auto_check_page' }));
    state.profileId = 'other-profile';
    rerender(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    await act(async () =>
      finish({ ok: true, json: async () => checkedStatus() })
    );
    expect(screen.queryByText('fb_auto_check_success')).toBeNull();
    expect(state.mutate).not.toHaveBeenCalled();
  });

  it('nao publica feedback no novo perfil depois da atualizacao do cache', async () => {
    let finish!: () => void;
    state.mutate.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const { rerender } = openPage();
    fireEvent.click(screen.getByRole('button', { name: 'fb_auto_check_page' }));
    await waitFor(() => expect(state.mutate).toHaveBeenCalledOnce());
    state.profileId = 'other-profile';
    rerender(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    await act(async () => finish());
    expect(screen.queryByText('fb_auto_check_success')).toBeNull();
  });
});
describe('resumo de configuracao Facebook', () => {
  it('explica as duas autorizacoes e o webhook mesmo sem detalhes da Pagina', () => {
    state.view = undefined;
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
        helpOpen
        onHelpChange={vi.fn()}
      />
    );
    const drawer = screen.getByRole('dialog');
    expect(within(drawer).getByText('fb_guide_login_authorize')).toBeTruthy();
    expect(within(drawer).queryByText('fb_guide_system_token')).toBeNull();
    fireEvent.click(
      within(drawer).getByRole('radio', { name: 'meta_system_tab' })
    );
    expect(within(drawer).getByText('fb_guide_system_token')).toBeTruthy();
    expect(within(drawer).getByText('fb_guide_shared_webhook')).toBeTruthy();
    expect(state.fetch).not.toHaveBeenCalled();
  });

  it('cache ausente nao vira perda de autorizacao e verificar nao ativa', async () => {
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    expect(screen.getByText('fb_auto_compact_unchecked')).toBeTruthy();
    expect(state.proof).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'fb_auto_check_page' }));
    await waitFor(() =>
      expect(state.fetch).toHaveBeenCalledWith(
        '/facebook-automations/fb/check',
        { method: 'POST' }
      )
    );
    expect(
      screen.queryByRole('button', { name: 'fb_auto_reauthorize' })
    ).toBeNull();
  });
  it('conexao confirmada oferece criar com a pagina selecionada e diagnostico fechado', () => {
    state.view.status = {
      stage: 'RECEIVING_READY',
      checkedAt: '2026-10-22T18:00:00Z',
      missingPermissions: [],
    };
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    expect(
      screen
        .getByRole('link', { name: 'shared_create_automation' })
        .getAttribute('href')
    ).toContain('channel=fb');
    expect(state.proof).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue('VERIFY')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain(
      'fb_auto_ready_compact'
    );
  });
  it('conflito informa o impacto fora do avancado e atalho abre Messenger sem enviar', async () => {
    state.view.status = {
      stage: 'CALLBACK_CONFLICT',
      checkedAt: '2026-10-22T18:00:00Z',
      missingPermissions: [],
    };
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    expect(
      within(screen.getByRole('alert')).getByText('fb_auto_callback_impact')
    ).toBeTruthy();
    expect(screen.queryByDisplayValue('VERIFY')).toBeNull();
    expect(screen.queryByText('fb_auto_missing')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
    state.openMessenger.mockImplementationOnce(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'fb_auto_open_messenger',
      })
    );
    expect(state.openMessenger).toHaveBeenCalledOnce();
    expect(screen.queryByDisplayValue('VERIFY')).toBeNull();
    expect(state.fetch).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'fb_auto_activate' }));
    await waitFor(() =>
      expect(state.fetch).toHaveBeenCalledWith(
        '/facebook-automations/fb/activate',
        { method: 'POST' }
      )
    );
  });
  it('falha atual nao vira sucesso historico e oferece verificar a pagina', () => {
    state.view.status = {
      stage: 'CHECK_FAILED',
      checkedAt: '2026-10-23T18:00:00Z',
      lastReadyAt: '2026-10-22T18:00:00Z',
      missingPermissions: [],
    };
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    expect(
      within(screen.getByRole('alert')).getByText(
        'fb_auto_compact_check_failed'
      )
    ).toBeTruthy();
    expect(screen.queryByText('fb_auto_ready_compact')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'fb_auto_check_page' })
    ).toBeTruthy();
  });
  it('trocar de pagina fecha drawer e desmonta diagnostico', async () => {
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
    fireEvent.click(screen.getByRole('tab', { name: 'meta_help_diagnostics' }));
    expect(await screen.findByText('proof')).toBeTruthy();
    fireEvent.change(
      document.querySelector('select[name="facebookAutomationPage"]')!,
      { target: { value: '' } }
    );
    expect(screen.queryByText('proof')).toBeNull();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'fb' } });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('proof')).toBeNull();
  });
  it('preserva datas e diagnostico sem exibir webhook nem ativar ao abrir', async () => {
    state.view.status = {
      stage: 'RECEIVING_READY',
      checkedAt: '2026-10-22T18:00:00Z',
      missingPermissions: [],
    };
    state.view.receipt = {
      receivedAt: '2026-10-22T18:01:00Z',
      postId: 'post',
      commentId: 'comment',
    };
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    expect(screen.queryByText('fb_auto_checked_at')).toBeNull();
    expect(screen.getByText('fb_auto_previous_check')).toBeTruthy();
    expect(screen.queryByText('fb_guide_login_authorize')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
    fireEvent.click(screen.getByRole('tab', { name: 'meta_help_diagnostics' }));
    expect(screen.queryByText('fb_auto_webhook_heading')).toBeNull();
    expect(screen.queryByDisplayValue('VERIFY')).toBeNull();
    const diagnostics = screen.getByRole('dialog', {
      name: 'meta_help · Facebook',
    });
    expect(
      await within(diagnostics).findByText('meta_diagnostic_page_checked')
    ).toBeTruthy();
    expect(screen.getByText('meta_diagnostic_last_comment')).toBeTruthy();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it('orienta pagina ainda nao autorizada sem montar prova nem enviar ao abrir', () => {
    state.view.authorized = false;
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    expect(
      screen.getByRole('button', { name: 'fb_auto_authorize' })
    ).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'fb_auto_activate' })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
    expect(
      within(screen.getByRole('dialog')).getByText('fb_guide_login_authorize')
    ).toBeTruthy();
    expect(state.proof).not.toHaveBeenCalled();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it.each(['escape', 'close', 'back', 'backdrop'])(
    'fecha ajuda por %s sem enviar',
    (method) => {
      render(
        <FacebookAutomationSetup
          credentialVersion="v1"
          onOpenMessenger={state.openMessenger}
        />
      );
      const trigger = screen.getByRole('button', {
        name: 'meta_help',
      });
      fireEvent.click(trigger);
      const dialog = screen.getByRole('dialog');
      if (method === 'escape')
        fireEvent(dialog, new Event('cancel', { cancelable: true }));
      if (method === 'close')
        fireEvent.click(within(dialog).getByRole('button', { name: 'close' }));
      if (method === 'back')
        fireEvent.click(
          within(dialog).getByRole('button', { name: 'meta_help_back' })
        );
      if (method === 'backdrop') {
        fireEvent.pointerDown(dialog);
        fireEvent.pointerUp(dialog);
        fireEvent.click(dialog);
      }
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByText('proof')).toBeNull();
      expect(state.fetch).not.toHaveBeenCalled();
    }
  );
  it.each(['profile', 'credential'])(
    'troca de %s desmonta o drawer',
    (change) => {
      const { rerender } = render(
        <FacebookAutomationSetup
          credentialVersion="v1"
          onOpenMessenger={state.openMessenger}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
      if (change === 'profile') state.profileId = 'other-profile';
      rerender(
        <FacebookAutomationSetup
          credentialVersion={change === 'credential' ? 'v2' : 'v1'}
          onOpenMessenger={state.openMessenger}
        />
      );
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(screen.queryByText('proof')).toBeNull();
      expect(state.fetch).not.toHaveBeenCalled();
    }
  );
  it('renovar no drawer usa a pagina selecionada e mostra falha dentro do guia', async () => {
    state.fetch.mockResolvedValue({ ok: false });
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
    fireEvent.click(screen.getByRole('tab', { name: 'meta_help_diagnostics' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'fb_auto_reauthorize' })
    );
    await waitFor(() =>
      expect(within(dialog).getByRole('alert').textContent).toContain(
        'fb_auto_error'
      )
    );
    expect(state.fetch).toHaveBeenCalledExactlyOnceWith(
      '/facebook-automations/fb/authorize',
      { method: 'POST' }
    );
  });
  it('detalhes de permissoes e validade ficam no drawer sem dados do webhook', () => {
    state.view.status = {
      stage: 'AUTHORIZATION_REQUIRED',
      checkedAt: '2026-10-22T18:00:00Z',
      missingPermissions: ['pages_messaging'],
      tokenExpiresAt: '2026-12-22T18:00:00Z',
      dataAccessExpiresAt: '2027-01-22T18:00:00Z',
    };
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    expect(
      screen.getByText('fb_auto_compact_authorization_required')
    ).toBeTruthy();
    expect(screen.queryByText('fb_auto_missing')).toBeNull();
    expect(screen.queryByText(/shared_token_expiry/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
    fireEvent.click(screen.getByRole('tab', { name: 'meta_help_diagnostics' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('fb_auto_missing')).toBeTruthy();
    expect(
      within(dialog).getByText('meta_diagnostic_page_expiry')
    ).toBeTruthy();
    expect(
      within(dialog).getByText('meta_diagnostic_page_data_expiry')
    ).toBeTruthy();
    expect(screen.queryByDisplayValue('VERIFY')).toBeNull();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it('erro da consulta impede que o drawer apresente sucesso antigo', async () => {
    state.view.status = {
      stage: 'RECEIVING_READY',
      checkedAt: '2026-10-22T18:00:00Z',
      missingPermissions: [],
    };
    state.fetch.mockResolvedValue({ ok: false });
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'fb_auto_check_page' }));
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
    fireEvent.click(screen.getByRole('tab', { name: 'meta_help_diagnostics' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('alert').textContent).toContain(
      'fb_auto_error'
    );
    expect(within(dialog).queryByText('fb_auto_ready_compact')).toBeNull();
    expect(
      screen.queryByRole('link', { name: 'shared_create_automation' })
    ).toBeNull();
  });
});

describe('autorizacao alternativa de sistema', () => {
  it('oferece alternativa quando falta autorizacao e envia apenas escopo e pagina', async () => {
    state.view.authorized = false;
    state.view.systemUserConfigured = true;
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'fb_system_use' }));
    await waitFor(() =>
      expect(state.fetch).toHaveBeenCalledExactlyOnceWith(
        '/facebook-automations/fb/system-user',
        {
          method: 'POST',
          headers: {
            'x-expected-org-id': 'org',
            'x-expected-profile-id': 'profile',
          },
        }
      )
    );
  });
  it('mantem alternativa fora da tela principal quando a pagina ja esta autorizada', () => {
    state.view.systemUserConfigured = true;
    state.view.authorization = {
      source: 'SYSTEM_USER',
      noScheduledExpiry: true,
      dataAccessExpiresAt: '2027-01-22T18:00:00Z',
    };
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    expect(screen.queryByRole('button', { name: 'fb_system_use' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
    fireEvent.click(screen.getByRole('tab', { name: 'meta_help_diagnostics' }));
    expect(screen.getByText('meta_system_tab')).toBeTruthy();
    expect(screen.getByText('meta_diagnostic_no_expiry')).toBeTruthy();
    expect(screen.getByText('meta_diagnostic_source_data_expiry')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'fb_system_renew' })
    ).toBeTruthy();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it('direciona ao cadastro pelo guia sem acionar autorizacao', () => {
    const openSystem = vi.fn(() =>
      expect(screen.queryByRole('dialog')).toBeNull()
    );
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
        onOpenSystemUser={openSystem}
      />
    );
    expect(screen.queryByRole('button', { name: 'fb_system_use' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
    fireEvent.click(screen.getByRole('radio', { name: 'meta_system_tab' }));
    fireEvent.click(screen.getByRole('button', { name: 'fb_system_open' }));
    expect(openSystem).toHaveBeenCalledOnce();
    expect(state.fetch).not.toHaveBeenCalled();
  });
  it('mostra falha acionavel no drawer e nunca corpo bruto da Meta', async () => {
    state.view.systemUserConfigured = true;
    state.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({
        message: 'SYSTEM_USER_APP_MISMATCH',
        secret: 'PRIVATE',
      }),
    });
    render(
      <FacebookAutomationSetup
        credentialVersion="v1"
        onOpenMessenger={state.openMessenger}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'meta_help' }));
    fireEvent.click(screen.getByRole('tab', { name: 'meta_help_diagnostics' }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'fb_system_use' })
    );
    await waitFor(() =>
      expect(within(dialog).getByRole('alert').textContent).toBe(
        'fb_system_error_app'
      )
    );
    expect(screen.queryByText('PRIVATE')).toBeNull();
    expect(screen.getByText('fb_guide_login')).toBeTruthy();
  });
});
