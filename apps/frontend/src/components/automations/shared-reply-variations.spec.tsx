import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { SharedReplyVariations } from './shared-reply-variations.component';
import { validateSharedDraft } from './shared-flow-ui';
import { simpleDefinition } from '@gitroom/nestjs-libraries/database/prisma/flows-v2/flow-definition';
vi.mock('@gitroom/react/translation/get.transation.service.client', () => ({
  useT: () => (key: string) => key,
}));
afterEach(cleanup);
describe('variacoes publicas V2', () => {
  it('limita a dez, preserva vazias para validacao e permite remover alternativas', () => {
    const edits = vi.fn();
    function Editor() {
      const [messages, setMessages] = useState(['Original']);
      return (
        <SharedReplyVariations
          messages={messages}
          onChange={(value) => {
            edits(value);
            setMessages(value);
          }}
        />
      );
    }
    render(<Editor />);
    for (let i = 1; i < 10; i++)
      fireEvent.click(
        screen.getByRole('button', { name: 'wizard_add_reply_variant' })
      );
    expect(screen.getAllByRole('textbox')).toHaveLength(10);
    expect(
      (
        screen.getByRole('button', {
          name: 'wizard_add_reply_variant',
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
    expect(edits.mock.lastCall![0]).toEqual(['Original', ...Array(9).fill('')]);
    fireEvent.click(
      screen.getByRole('button', { name: 'shared_reply_remove 1' })
    );
    expect(
      (screen.getByLabelText('shared_public_reply') as HTMLTextAreaElement)
        .value
    ).toBe('');
    expect(screen.getAllByRole('textbox')).toHaveLength(9);
  });
  it('bloqueia edicao e remocao quando automacao esta ativa', () => {
    render(
      <SharedReplyVariations
        messages={['A', 'B']}
        disabled
        onChange={vi.fn()}
      />
    );
    for (const element of [
      ...screen.getAllByRole('textbox'),
      ...screen.getAllByRole('button'),
    ])
      expect((element as HTMLButtonElement).disabled).toBe(true);
  });
  it('aponta o no com variacao invalida mesmo quando a primeira esta correta', () => {
    const graph = simpleDefinition({
      message: 'DM',
      replyMessages: ['Boa', ''],
    });
    expect(
      validateSharedDraft(
        'Nome',
        [{ integrationId: 'fb', postMode: 'all', postIds: [] }],
        graph
      )
    ).toEqual([
      { field: 'definition', code: 'INVALID_MESSAGE', nodeId: 'reply' },
    ]);
  });
});
