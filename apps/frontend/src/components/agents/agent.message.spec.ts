import { describe, expect, it } from 'vitest';
import { getAgentMessageText } from './agent.message';
describe('conteudo de mensagem do Copilot', () => {
  it('mantem texto e marcadores de midia do cliente antigo', () => {
    const text =
      'Mensagem\n[--Media--]Image: https://example.test/a.png\n[--Media--]';
    expect(getAgentMessageText(text)).toBe(text);
  });
  it('normaliza partes de texto do cliente novo sem serializar objetos', () => {
    expect(
      getAgentMessageText([
        { type: 'text', text: 'Primeiro' },
        {
          type: 'image',
          source: { type: 'url', value: 'https://example.test/a.png' },
        },
        { type: 'text', text: 'Segundo' },
      ])
    ).toBe('Primeiro\nSegundo');
    expect(getAgentMessageText(undefined)).toBe('');
  });
});
