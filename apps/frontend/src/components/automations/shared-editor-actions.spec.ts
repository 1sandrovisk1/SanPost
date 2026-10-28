import { describe, expect, it, vi } from 'vitest';
import { saveEditorChanges, setEditorStatus } from './shared-editor-actions';
const response = (value: unknown, ok = true) =>
  ({ ok, json: async () => value } as Response);
const config = { name: 'Fixture', integrationId: 'ig', dmMessage: 'Mensagem' };
describe('salvar e ativar sem duplicacao ou revisao antiga', () => {
  it('Instagram prepara ID, salva sem ativar e depois muda status', async () => {
    const remember = vi.fn();
    const api = vi
      .fn()
      .mockResolvedValueOnce(
        response({ id: 'same', status: 'DRAFT', updatedAt: 'v1' })
      )
      .mockResolvedValueOnce(
        response({ id: 'same', status: 'DRAFT', updatedAt: 'v2' })
      )
      .mockResolvedValueOnce(response({ id: 'same', status: 'ACTIVE' }));
    await saveEditorChanges(
      api,
      { engine: 'instagram', body: config, activate: true },
      remember
    );
    expect(api.mock.calls.map((c) => c[0])).toEqual([
      '/flows',
      '/flows/same/quick-update',
      '/flows/same/status',
    ]);
    expect(JSON.parse(api.mock.calls[1][1].body)).toMatchObject({
      activate: false,
      expectedUpdatedAt: 'v1',
    });
    expect(remember.mock.calls[0][0]).toMatchObject({
      id: 'same',
      status: 'DRAFT',
    });
  });
  it('Facebook ativa usando revisao nova devolvida pelo save', async () => {
    const api = vi
      .fn()
      .mockResolvedValueOnce(
        response({ id: 'fb', revision: 8, status: 'PAUSED' })
      )
      .mockResolvedValueOnce(
        response({ id: 'fb', revision: 9, status: 'ACTIVE' })
      );
    await saveEditorChanges(
      api,
      {
        engine: 'facebook',
        current: { id: 'fb', revision: 7, status: 'PAUSED' },
        body: { name: 'Atualizada' },
        activate: true,
      },
      vi.fn()
    );
    expect(JSON.parse(api.mock.calls[0][1].body)).toMatchObject({
      expectedRevision: 7,
    });
    expect(JSON.parse(api.mock.calls[1][1].body)).toEqual({
      status: 'ACTIVE',
      expectedRevision: 8,
    });
  });
  it('falha de ativacao preserva ID/revisao e retry faz so status', async () => {
    let saved: any;
    const remember = (value: any) => {
      saved = value;
    };
    const api = vi
      .fn()
      .mockResolvedValueOnce(
        response({ id: 'fb', revision: 1, status: 'DRAFT' })
      )
      .mockResolvedValueOnce(response({ message: 'NOT_READY' }, false));
    await expect(
      saveEditorChanges(
        api,
        { engine: 'facebook', body: { name: 'Fixture' }, activate: true },
        remember
      )
    ).rejects.toThrow('NOT_READY');
    expect(saved).toMatchObject({ id: 'fb', revision: 1, status: 'DRAFT' });
    api.mockResolvedValue(
      response({ id: 'fb', revision: 2, status: 'ACTIVE' })
    );
    await setEditorStatus(api, 'facebook', saved, 'ACTIVE', remember);
    expect(api.mock.calls.filter((c) => c[0] === '/flows-v2')).toHaveLength(1);
    expect(api.mock.calls.at(-1)?.[0]).toBe('/flows-v2/fb/status');
  });
  it('erro no quick-update do Instagram permite retry no rascunho preparado', async () => {
    let saved: any;
    const remember = (value: any) => {
      saved = value;
    };
    const api = vi
      .fn()
      .mockResolvedValueOnce(response({ id: 'ig', status: 'DRAFT' }))
      .mockResolvedValueOnce(response({ message: 'INVALID_GRAPH' }, false));
    await expect(
      saveEditorChanges(api, { engine: 'instagram', body: config }, remember)
    ).rejects.toThrow('INVALID_GRAPH');
    api.mockResolvedValue(response({ id: 'ig', status: 'DRAFT' }));
    await saveEditorChanges(
      api,
      { engine: 'instagram', current: saved, body: config },
      remember
    );
    expect(api.mock.calls.filter((c) => c[0] === '/flows')).toHaveLength(1);
    expect(api.mock.calls.at(-1)?.[0]).toBe('/flows/ig/quick-update');
  });
  it('status nao regrava campos do formulario nem inventa revisao V2', async () => {
    const api = vi.fn();
    await expect(
      setEditorStatus(api, 'facebook', { id: 'fb' }, 'ACTIVE', vi.fn())
    ).rejects.toThrow('REVISION_CONFLICT');
    expect(api).not.toHaveBeenCalled();
  });
});
