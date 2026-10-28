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
it('edita CTA de uma alternativa sem mudar o texto ou botao das outras', () => {
  const onVariantsChange = vi.fn();
  render(
    <PrivateMessageVariations
      messages={['A', 'B']}
      buttonText="Antigo"
      buttonUrl="https://example.com/old"
      onChange={vi.fn()}
      onVariantsChange={onVariantsChange}
    />
  );
  fireEvent.click(
    screen.getAllByRole('button', {
      name: 'Antigo · https://example.com/old',
    })[1]
  );
  fireEvent.change(screen.getByLabelText('add_link_button_text'), {
    target: { value: 'Novo' },
  });
  fireEvent.change(screen.getByLabelText('add_link_url'), {
    target: { value: 'https://example.com/new' },
  });
  fireEvent.click(screen.getByText('save'));
  expect(onVariantsChange).toHaveBeenCalledWith([
    {
      message: 'A',
      buttonText: 'Antigo',
      buttonUrl: 'https://example.com/old',
    },
    { message: 'B', buttonText: 'Novo', buttonUrl: 'https://example.com/new' },
  ]);
});
