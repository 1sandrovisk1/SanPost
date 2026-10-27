import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { SWRConfig } from 'swr';
import type { FacebookPrivateReplyTestView } from '@gitroom/nestjs-libraries/dtos/integrations/facebook-automation.dto';
import { FacebookPrivateReplyTest } from './facebook-private-reply-test.component';
const { fetchApi } = vi.hoisted(() => ({ fetchApi: vi.fn() }));
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => fetchApi,
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
  useTranslationSettings: () => ({ resolvedLanguage: 'pt' }),
}));
const preview: Extract<FacebookPrivateReplyTestView, { available: true }> = {
  available: true,
  pageId: '123',
  postId: '123_789',
  commentId: '789_321',
  text: 'Mensagem aprovada https://example.com',
  revision: 'a'.repeat(64),
  canSend: true,
  blockedReason: null,
  result: null,
};
function mount(integrationId = 'integration') {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <FacebookPrivateReplyTest
        key={integrationId}
        scope="org:profile:credential"
        integrationId={integrationId}
      />
    </SWRConfig>
  );
}
function response(data: unknown, ok = true) {
  return { ok, json: async () => data };
}
beforeEach(() => {
  fetchApi.mockReset();
  fetchApi.mockResolvedValue(response(preview));
});
afterEach(cleanup);
describe('teste privado pelo painel Facebook', () => {
  it('resume o aceite e recolhe identificadores sem oferecer reenvio', async () => {
    fetchApi.mockResolvedValue(
      response({
        ...preview,
        canSend: false,
        result: { status: 'SENT', remoteId: 'mid.123' },
      })
    );
    mount();
    await screen.findByText('fb_proof_sent');
    expect(
      screen.getByText('meta_diagnostic_result_details').closest('details')
        ?.open
    ).toBe(false);
    expect(screen.getByDisplayValue('mid.123').closest('details')?.open).toBe(
      false
    );
    expect(screen.queryByRole('button', { name: 'fb_proof_send' })).toBeNull();
    expect(fetchApi.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });
  it('nao envia ao carregar e oculta fora do alvo', async () => {
    fetchApi.mockResolvedValue(response({ available: false }));
    mount();
    await waitFor(() => expect(fetchApi).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'fb_proof_send' })).toBeNull();
    expect(fetchApi.mock.calls.every(([, options]) => !options.method)).toBe(
      true
    );
  });
  it('envia somente revisao e impede clique repetido e reenvio apos resultado', async () => {
    let finish: (value: unknown) => void = () => {};
    fetchApi.mockImplementation(async (_path, options) =>
      options.method === 'POST'
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : response(preview)
    );
    mount();
    const button = await screen.findByRole('button', { name: 'fb_proof_send' });
    expect(screen.getByText(preview.text)).toBeTruthy();
    fireEvent.click(button);
    fireEvent.click(button);
    expect(
      fetchApi.mock.calls.filter(([, options]) => options.method === 'POST')
    ).toHaveLength(1);
    expect(
      fetchApi.mock.calls.find(([, options]) => options.method === 'POST')?.[1]
        .body
    ).toBe(JSON.stringify({ revision: preview.revision }));
    finish(
      response({
        ...preview,
        canSend: false,
        result: { status: 'SENT', remoteId: 'mid.123' },
      })
    );
    await screen.findByText('fb_proof_sent');
    expect(screen.queryByRole('button', { name: 'fb_proof_send' })).toBeNull();
  });
  it('falha HTTP nao e exibida como sucesso e permite somente atualizar resultado', async () => {
    fetchApi.mockImplementation(async (_path, options) =>
      options.method === 'POST'
        ? response({ message: 'error' }, false)
        : response(preview)
    );
    mount();
    fireEvent.click(
      await screen.findByRole('button', { name: 'fb_proof_send' })
    );
    await screen.findByRole('alert');
    expect(
      (
        screen.getByRole('button', {
          name: 'fb_proof_send',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(
      screen.getByRole('button', { name: 'fb_proof_refresh' })
    ).toBeTruthy();
    expect(screen.queryByText('fb_proof_sent')).toBeNull();
  });
  it('resultado persistido e comentario divergente nao oferecem novo envio', async () => {
    fetchApi.mockResolvedValue(
      response({ ...preview, canSend: false, result: { status: 'UNKNOWN' } })
    );
    mount();
    await screen.findByText('fb_proof_unknown');
    expect(screen.queryByRole('button', { name: 'fb_proof_send' })).toBeNull();
  });
});
