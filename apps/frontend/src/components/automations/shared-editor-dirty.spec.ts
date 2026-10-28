import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useEditorDirty } from './shared-editor-dirty';
describe('alteracoes nao salvas do editor', () => {
  it('renova baseline mesmo quando a versao remota muda sem alterar os campos', () => {
    const hook = renderHook(({ value }) => useEditorDirty(value), {
      initialProps: { value: 'carregado' },
    });
    act(() => hook.result.current.resetBaseline());
    hook.rerender({ value: 'primeira edicao' });
    expect(hook.result.current.dirty).toBe(true);
  });
  it('hidrata antes de definir base e conserva edicao durante resposta de save anterior', () => {
    const hook = renderHook(
      ({ value, ready }) => useEditorDirty(value, ready),
      { initialProps: { value: 'vazio', ready: false } }
    );
    hook.rerender({ value: 'carregado', ready: true });
    expect(hook.result.current.dirty).toBe(false);
    hook.rerender({ value: 'editado', ready: true });
    expect(hook.result.current.dirty).toBe(true);
    act(() => hook.result.current.markSaved('carregado'));
    expect(hook.result.current.dirty).toBe(true);
    act(() => hook.result.current.markSaved('editado'));
    expect(hook.result.current.dirty).toBe(false);
  });
});
