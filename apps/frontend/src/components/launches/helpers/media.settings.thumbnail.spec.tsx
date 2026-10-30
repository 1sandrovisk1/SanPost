import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), exit: vi.fn() }));
vi.mock(
  '@gitroom/frontend/components/launches/helpers/top.title.component',
  () => ({ TopTitle: (): null => null })
);
vi.mock('@gitroom/helpers/utils/custom.fetch', () => ({
  useFetch: () => mocks.fetch,
}));
vi.mock('@gitroom/frontend/components/new-launch/store', () => ({
  useLaunchStore: (
    selector: (value: { setActivateExitButton: typeof mocks.exit }) => unknown
  ) => selector({ setActivateExitButton: mocks.exit }),
}));
vi.mock('@gitroom/react/helpers/variable.context', () => ({
  useVariables: () => ({ backendUrl: 'https://api.example.com' }),
}));
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
vi.mock('@gitroom/frontend/components/layout/new-modal', () => ({
  useModals: () => ({ openModal: vi.fn() }),
}));
vi.mock('@gitroom/frontend/components/media/media.component', () => ({
  MediaBox: (): null => null,
}));
import { MediaComponentInner } from './media.settings.component';
const media = {
  id: 'video-1',
  name: 'video',
  path: 'https://media.example.com/video.mp4',
  thumbnail: 'https://media.example.com/selected-frame.jpg',
  thumbnailTimestamp: 0,
  alt: 'Capa',
};

describe('salvar configuracoes de thumbnail', () => {
  beforeEach(() => {
    mocks.fetch.mockReset();
    mocks.exit.mockClear();
  });
  afterEach(cleanup);
  it.each([400, 500])(
    'nao fecha o modal nem confirma alteracao quando a API responde %s',
    async (status) => {
      mocks.fetch.mockResolvedValue({
        ok: false,
        status,
        json: async () => ({ message: 'raw secret from provider' }),
      });
      const onClose = vi.fn(),
        onSelect = vi.fn();
      render(
        <MediaComponentInner
          media={media}
          onClose={onClose}
          onSelect={onSelect}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
      await waitFor(() =>
        expect(
          screen.queryByText((text) =>
            /could not save|unable to save|failed to save/i.test(text)
          )
        ).not.toBeNull()
      );
      expect(onClose).not.toHaveBeenCalled();
      expect(onSelect).not.toHaveBeenCalled();
      expect(screen.queryByText('raw secret from provider')).toBeNull();
      expect(
        (
          screen.getByRole('button', {
            name: 'Save Changes',
          }) as HTMLButtonElement
        ).disabled
      ).toBe(false);
    }
  );
  it('confirma o registro salvo somente depois do sucesso e preserva timestamp zero', async () => {
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => media,
    });
    const onClose = vi.fn(),
      onSelect = vi.fn();
    render(
      <MediaComponentInner
        media={media}
        onClose={onClose}
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSelect).toHaveBeenCalledWith(media);
    expect(onSelect.mock.invocationCallOrder[0]).toBeLessThan(
      onClose.mock.invocationCallOrder[0]
    );
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
      id: media.id,
      thumbnail: media.thumbnail,
      thumbnailTimestamp: 0,
    });
  });
  it('limpar a capa tambem limpa o timestamp antes de salvar', async () => {
    const cleared: Omit<typeof media, 'thumbnailTimestamp'> & {thumbnailTimestamp: number | null} = { ...media, thumbnail: '', thumbnailTimestamp: null };
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => cleared,
    });
    const onClose = vi.fn(),
      onSelect = vi.fn();
    render(
      <MediaComponentInner
        media={{ ...media, thumbnailTimestamp: 179950 }}
        onClose={onClose}
        onSelect={onSelect}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({
      thumbnail: '',
      thumbnailTimestamp: null,
    });
    expect(onSelect).toHaveBeenCalledWith(cleared);
  });
  it('clique repetido enquanto salva nao duplica gravacao nem callbacks', async () => {
    let finish!: (response: unknown) => void;
    mocks.fetch.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const onClose = vi.fn(),
      onSelect = vi.fn();
    render(
      <MediaComponentInner
        media={media}
        onClose={onClose}
        onSelect={onSelect}
      />
    );
    const button = screen.getByRole('button', { name: 'Save Changes' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect((button as HTMLButtonElement).disabled).toBe(true);
    finish({ ok: true, status: 200, json: async () => media });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});
