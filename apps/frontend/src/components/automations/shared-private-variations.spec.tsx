import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { PrivateMessageVariations } from './shared-private-variations.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (k: string) => k,
}));
afterEach(cleanup);
describe('alternativas privadas', () => {
  it('adiciona alternativa sem transformar em envio sequencial e oferece tokens do Messenger', () => {
    const change = vi.fn();
    render(
      <PrivateMessageVariations
        messages={['Ola']}
        onChange={change}
        engine="shared"
        messenger
      />
    );
    fireEvent.click(screen.getByText('wizard_add_reply_variant'));
    expect(change).toHaveBeenCalledWith(['Ola', '']);
    const select = screen.getByRole('combobox');
    expect(select.querySelector('[value="{{comment_text}}"]')).toBeTruthy();
    expect(select.querySelector('[value="{{comment_name}}"]')).toBeNull();
  });
});
