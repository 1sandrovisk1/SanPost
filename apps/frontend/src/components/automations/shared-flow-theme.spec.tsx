import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useFlowTheme } from './shared-flow-theme';
afterEach(() => {
  cleanup();
  document.body.className = '';
});
describe('tema dos construtores de automacao', () => {
  it('acompanha troca de tema da pagina sem remontar o canvas', async () => {
    document.body.className = 'light';
    const { result } = renderHook(() => useFlowTheme());
    expect(result.current).toBe('light');
    act(() => {
      document.body.className = 'dark';
    });
    await waitFor(() => expect(result.current).toBe('dark'));
    act(() => {
      document.body.className = 'light';
    });
    await waitFor(() => expect(result.current).toBe('light'));
  });
  it('usa o tema escuro padrao sem classe de tema', () => {
    expect(renderHook(() => useFlowTheme()).result.current).toBe('dark');
  });
});
