import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Button } from './button';
afterEach(cleanup);
describe('feedback de carregamento opt-in', () => {
  it('mantem texto e spinner visiveis e bloqueia cliques durante a acao', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <Button secondary loading loadingLabel="Verificando…" onClick={onClick}>
        Verificar
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Verificando…' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.querySelector('.invisible')).toBeNull();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    rerender(
      <Button secondary loadingLabel="Verificando…" onClick={onClick}>
        Verificar
      </Button>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
  it('preserva a apresentacao dos consumidores legados', () => {
    const { container } = render(<Button loading>Salvar</Button>);
    expect(container.querySelector('.invisible')).toBeTruthy();
    expect(container.querySelector('.absolute')).toBeTruthy();
  });
});
