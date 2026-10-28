import { useState, useLayoutEffect, useRef } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { AutomationMessageVariables } from './shared-message-variables.component';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (k: string) => k,
}));
vi.mock('emoji-picker-react', () => ({
  default: ({ onEmojiClick, autoFocusSearch }: any) => {
    const input = useRef<HTMLInputElement>(null);
    useLayoutEffect(() => {
      if (autoFocusSearch) input.current?.focus();
    }, []);
    return (
      <>
        <input ref={input} aria-label="Buscar emoji" />
        <button onClick={() => onEmojiClick({ emoji: '😊' })}>
          Escolher 😊
        </button>
      </>
    );
  },
  Theme: { DARK: 'dark', LIGHT: 'light' },
  EmojiStyle: { NATIVE: 'native' },
  Categories: { SUGGESTED: 'suggested', SMILEYS_PEOPLE: 'smileys_people' },
}));
afterEach(cleanup);
function Editor({
  initial = 'Ola mundo',
  maxLength = 100,
  variables = true,
  messenger = false,
}: {
  initial?: string;
  maxLength?: number;
  variables?: boolean;
  messenger?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <textarea
        id="msg"
        aria-label="Mensagem"
        value={value}
        maxLength={maxLength}
        onChange={(e) => setValue(e.target.value)}
      />
      <AutomationMessageVariables
        textareaId="msg"
        onChange={setValue}
        variables={variables}
        engine={messenger ? 'shared' : 'legacy'}
        messenger={messenger}
      />
      <button>Fora</button>
    </>
  );
}
it('oferece ferramentas apenas no foco e insere variavel na selecao com retorno ao cursor', async () => {
  render(<Editor />);
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'automation_insert_variable' })
  ).toBeNull();
  const field = screen.getByRole('textbox') as HTMLTextAreaElement;
  fireEvent.focus(field);
  field.setSelectionRange(4, 9);
  fireEvent.select(field);
  fireEvent.click(
    screen.getByRole('button', { name: 'automation_insert_variable' })
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'automation_variable_commenter_name' })
  );
  await waitFor(() => expect(field.value).toBe('Ola {commenter_name}'));
  await waitFor(() => expect(document.activeElement).toBe(field));
  expect(field.selectionStart).toBe(field.value.length);
  fireEvent.focusIn(screen.getByText('Fora'));
  expect(
    screen.queryByRole('button', { name: 'automation_insert_variable' })
  ).toBeNull();
});
it('insere emoji completo, recusa exceder limite e permite substituir selecao', async () => {
  render(<Editor initial="12345" maxLength={6} variables={false} />);
  const field = screen.getByRole('textbox') as HTMLTextAreaElement;
  fireEvent.focus(field);
  field.setSelectionRange(5, 5);
  fireEvent.select(field);
  fireEvent.click(screen.getByRole('button', { name: 'insert_emoji' }));
  fireEvent.click(screen.getByText('Escolher 😊'));
  expect(field.value).toBe('12345');
  expect(screen.getByRole('status').textContent).toContain(
    'automation_text_limit'
  );
  field.setSelectionRange(4, 5);
  fireEvent.select(field);
  fireEvent.click(screen.getByRole('button', { name: 'insert_emoji' }));
  fireEvent.click(screen.getByText('Escolher 😊'));
  await waitFor(() => expect(field.value).toBe('1234😊'));
  expect(
    screen.queryByRole('button', { name: 'automation_insert_variable' })
  ).toBeNull();
});
it('Messenger oferece somente tokens suportados e Escape fecha sem fechar o editor', () => {
  render(<Editor messenger />);
  fireEvent.focus(screen.getByRole('textbox'));
  fireEvent.click(
    screen.getByRole('button', { name: 'automation_insert_variable' })
  );
  expect(
    screen.getByRole('button', { name: 'automation_variable_message_text' })
  ).toBeTruthy();
  expect(
    screen.getByRole('button', { name: 'automation_variable_message_id' })
  ).toBeTruthy();
  expect(
    screen.queryByRole('button', { name: 'automation_variable_comment_name' })
  ).toBeNull();
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
it('bloqueia insercao pelo portal quando o fieldset passa a ser desabilitado', () => {
  const change = vi.fn();
  const view = render(
    <fieldset>
      <textarea id="locked" defaultValue="Texto" />
      <AutomationMessageVariables textareaId="locked" onChange={change} />
    </fieldset>
  );
  fireEvent.focus(screen.getByRole('textbox'));
  fireEvent.click(
    screen.getByRole('button', { name: 'automation_insert_variable' })
  );
  view.rerender(
    <fieldset disabled>
      <textarea id="locked" defaultValue="Texto" />
      <AutomationMessageVariables textareaId="locked" onChange={change} />
    </fieldset>
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'automation_variable_commenter_name' })
  );
  expect(change).not.toHaveBeenCalled();
});
it('fecha menu ao reindexar alternativas e nao insere no campo remanescente', () => {
  const change = vi.fn();
  const view = render(
    <>
      <input id="reply" defaultValue="Publica" />
      <AutomationMessageVariables
        textareaId="reply"
        engine="shared"
        resetKey={2}
        onChange={change}
      />
    </>
  );
  const field = screen.getByRole('textbox') as HTMLInputElement;
  fireEvent.focus(field);
  field.setSelectionRange(0, 7);
  fireEvent.select(field);
  fireEvent.click(
    screen.getByRole('button', { name: 'automation_insert_variable' })
  );
  view.rerender(
    <>
      <input id="reply" defaultValue="Publica" />
      <AutomationMessageVariables
        textareaId="reply"
        engine="shared"
        resetKey={1}
        onChange={change}
      />
    </>
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(change).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'automation_insert_variable' })
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'automation_variable_comment_name' })
  );
  expect(change).toHaveBeenCalledWith('{{comment_name}}');
});

it('mantem seletor aberto ao focar e digitar na busca de emojis', () => {
  render(<Editor />);
  fireEvent.focus(screen.getByRole('textbox', { name: 'Mensagem' }));
  fireEvent.click(screen.getByRole('button', { name: 'insert_emoji' }));
  const search = screen.getByRole('textbox', { name: 'Buscar emoji' });
  expect(document.activeElement).toBe(search);
  fireEvent.change(search, { target: { value: 'smile' } });
  expect(screen.getByRole('dialog', { name: 'insert_emoji' })).toBeTruthy();
});
