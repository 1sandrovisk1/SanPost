import {
  stablePrivateMessage,
  validatePrivateMessageVariants,
} from './private-message-variants';
describe('alternativa privada estavel', () => {
  it('preserva o singular em replay antigo e escolhe de modo estavel no novo', () => {
    const config = { message: 'antiga', messages: ['a', 'b', 'c'] };
    expect(stablePrivateMessage(config, 'execution:node', false)).toBe(
      'antiga'
    );
    const chosen = stablePrivateMessage(config, 'execution:node', true);
    expect(config.messages).toContain(chosen);
    expect(stablePrivateMessage(config, 'execution:node', true)).toBe(chosen);
    expect(
      new Set(
        Array.from({ length: 30 }, (_, i) =>
          stablePrivateMessage(config, `${i}:node`, true)
        )
      ).size
    ).toBeGreaterThan(1);
  });
});
it('valida todas as alternativas incluindo espacos e nao apenas a escolhida', () => {
  for (const messages of [
    [],
    ['a', '  '],
    Array(11).fill('a'),
    ['x'.repeat(2001)],
  ])
    expect(() => validatePrivateMessageVariants(messages)).toThrow(
      'INVALID_MESSAGE'
    );
  expect(() => validatePrivateMessageVariants(['a', 'b'])).not.toThrow();
});
