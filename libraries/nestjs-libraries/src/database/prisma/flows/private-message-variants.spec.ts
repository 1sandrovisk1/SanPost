import {
  stablePrivateMessage,
  stablePrivateVariant,
  validatePrivateButtonVariants,
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

it('escolhe o objeto completo com estabilidade e valida limites por objeto', () => {
  const variants = [
    { message: 'A', buttonText: 'A', buttonUrl: 'https://example.com/a' },
    { message: 'B' },
  ];
  expect(stablePrivateVariant(variants, 'seed')).toEqual(
    stablePrivateVariant(variants, 'seed')
  );
  expect(variants).toContainEqual(stablePrivateVariant(variants, 'seed'));
  expect(() =>
    validatePrivateButtonVariants([
      { message: 'x'.repeat(2000) },
      {
        message: 'x'.repeat(600),
        buttonText: 'Link',
        buttonUrl: 'https://example.com',
      },
    ])
  ).not.toThrow();
  for (const values of [
    [],
    [{ message: ' ' }],
    [{ message: 'a', buttonText: 'Link' }],
    [{ message: 'a', buttonText: 'Link', buttonUrl: 'http://example.com' }],
    [
      {
        message: 'a',
        buttonText: 'Link',
        buttonUrl: 'https://u:p@example.com',
      },
    ],
  ])
    expect(() => validatePrivateButtonVariants(values)).toThrow();
});
