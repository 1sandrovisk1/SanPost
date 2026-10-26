import 'reflect-metadata';
import { validate } from 'class-validator';
import { RedditSettingsDto, RedditSettingsDtoInner } from './reddit.dto';

const inner = (overrides: Record<string, unknown> = {}) =>
  Object.assign(new RedditSettingsDtoInner(), {
    subreddit: '/r/foo',
    title: 'Titulo',
    type: 'self',
    ...overrides,
  });

// Porte do upstream #1915 (type restrito) + limite de subreddits por post.
describe('RedditSettingsDtoInner.type', () => {
  it.each(['self', 'link', 'media'])('aceita %s', async (type) => {
    const errors = await validate(inner({ type, ...(type === 'link' ? { url: 'https://x.example/a' } : {}) }));
    expect(errors.map((e) => e.property)).not.toContain('type');
  });

  it.each(['image', 'video', 'videogif', 'x'])('rejeita %s (nunca publicava midia)', async (type) => {
    const errors = await validate(inner({ type }));
    expect(errors.map((e) => e.property)).toContain('type');
  });
});

describe('RedditSettingsDto.subreddit', () => {
  it('rejeita mais de 10 subreddits por post', async () => {
    const dto = Object.assign(new RedditSettingsDto(), {
      subreddit: Array.from({ length: 11 }, () => ({ value: inner() })),
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('subreddit');
  });
});
