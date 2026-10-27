import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { AutomationKeywordConditions } from './shared-keyword-conditions.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
afterEach(cleanup);
describe('condicoes comuns Instagram e Facebook', () => {
  it('exige escolha explicita de palavras e limpa termos ao voltar para qualquer palavra', () => {
    const change = vi.fn();
    function Editor() {
      const [specific, setSpecific] = useState(false);
      const [keywords, setKeywords] = useState<string[]>([]);
      return (
        <AutomationKeywordConditions
          specific={specific}
          keywords={keywords}
          onSpecificChange={setSpecific}
          onKeywordsChange={(v) => {
            change(v);
            setKeywords(v);
          }}
        />
      );
    }
    render(<Editor />);
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(
      screen.getByRole('radio', { name: 'wizard_specific_word' })
    );
    fireEvent.change(screen.getByLabelText('trigger_keywords'), {
      target: { value: 'quero, link' },
    });
    fireEvent.blur(screen.getByLabelText('trigger_keywords'));
    expect(change).toHaveBeenLastCalledWith(['quero', 'link']);
    fireEvent.click(screen.getByRole('radio', { name: 'wizard_any_word' }));
    expect(change).toHaveBeenLastCalledWith([]);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
  it('Messenger nao oferece qualquer palavra e respeita bloqueio do formulario', () => {
    render(
      <AutomationKeywordConditions
        specific
        keywords={['link']}
        requireKeywords
        disabled
        onSpecificChange={vi.fn()}
        onKeywordsChange={vi.fn()}
      />
    );
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByLabelText('trigger_keywords')).toHaveProperty(
      'disabled',
      true
    );
    for (const button of screen.getAllByRole('button'))
      expect(button).toHaveProperty('disabled', true);
  });
});
