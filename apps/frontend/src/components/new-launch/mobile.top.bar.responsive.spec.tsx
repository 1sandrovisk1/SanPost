import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (_key: string, fallback: string) => fallback,
}));
import { MobileTopBar } from './mobile.top.bar';
afterEach(cleanup);
describe('acoes do compositor mobile', () => {
  it('abre o menu e executa somente a acao escolhida', () => {
    const schedule = vi.fn(),
      draft = vi.fn();
    const view = render(
      <MobileTopBar
        onBack={() => {}}
        actions={[
          { label: 'Agendar', variant: 'primary', onClick: schedule },
          { label: 'Rascunho', variant: 'tertiary', onClick: draft },
        ]}
        disabled={false}
        loading={false}
      >
        Data
      </MobileTopBar>
    );
    fireEvent.click(view.getByRole('button', { name: 'Post' }));
    fireEvent.click(view.getByRole('button', { name: 'Rascunho' }));
    expect(draft).toHaveBeenCalledOnce();
    expect(schedule).not.toHaveBeenCalled();
  });
  it('trava tambem um menu ja aberto durante o salvamento', () => {
    const draft = vi.fn();
    const actions = [
      { label: 'Agendar', variant: 'primary' as const, onClick: () => {} },
      { label: 'Rascunho', variant: 'tertiary' as const, onClick: draft },
    ];
    const view = render(
      <MobileTopBar
        onBack={() => {}}
        actions={actions}
        disabled={false}
        loading={false}
      >
        Data
      </MobileTopBar>
    );
    fireEvent.click(view.getByRole('button', { name: 'Post' }));
    view.rerender(
      <MobileTopBar
        onBack={() => {}}
        actions={actions}
        disabled={true}
        loading={true}
      >
        Data
      </MobileTopBar>
    );
    fireEvent.click(view.getByRole('button', { name: 'Rascunho' }));
    expect(draft).not.toHaveBeenCalled();
  });
});
