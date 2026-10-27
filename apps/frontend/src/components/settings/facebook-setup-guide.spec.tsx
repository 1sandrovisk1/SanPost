import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FacebookSetupGuide } from './facebook-setup-guide.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
afterEach(cleanup);
describe('guia de autorizacao Facebook', () => {
  it('separa os metodos sem executar autorizacao e recolhe permissoes tecnicas', () => {
    const open = vi.fn();
    render(<FacebookSetupGuide onOpenSystemUser={open} />);
    expect(screen.queryByText('fb_guide_system_token')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'meta_system_tab' }));
    expect(screen.queryByText('fb_guide_login_authorize')).toBeNull();
    expect(screen.getByText('fb_guide_system_token')).toBeTruthy();
    expect(
      screen.getByText('fb_guide_permissions').closest('details')?.open
    ).toBe(false);
    expect(open).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'fb_system_open' }));
    expect(open).toHaveBeenCalledOnce();
  });
});
