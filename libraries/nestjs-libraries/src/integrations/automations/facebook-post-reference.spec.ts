import { facebookPostReference } from './facebook-post-reference';

describe('referencia de publicacao do Facebook', () => {
  it.each([
    '123_456',
    '456',
    ' 123_456 ',
    'https://www.facebook.com/123/posts/456/',
    'https://www.facebook.com/789/posts/456/',
    'https://facebook.com/Pagina.de.teste/posts/456?mibextid=test',
    'https://m.facebook.com/permalink.php?story_fbid=456&id=123',
    'https://www.facebook.com/story.php?story_fbid=123_456&id=123',
    'https://www.facebook.com/story.php?story_fbid=456&id=789',
  ])('normaliza %s para o ID da publicacao da Pagina', (reference) => {
    expect(facebookPostReference(reference, '123')).toBe('123_456');
  });
  it.each([
    '789_456',
    'https://facebook.com/789/posts/789_456',
    'https://facebook.com/story.php?story_fbid=789_456&id=789',
  ])('recusa referencia explicita de outra Pagina: %s', (reference) => {
    expect(() => facebookPostReference(reference, '123')).toThrow(
      'POST_CHANNEL_MISMATCH'
    );
  });
  it.each([
    '',
    'me',
    '../me',
    '123_456/comments',
    '1'.repeat(101),
    'https://facebook.com.evil.test/123/posts/456',
    'https://evil.test/123/posts/456',
    'http://facebook.com/123/posts/456',
    'https://secret@facebook.com/123/posts/456',
    'https://facebook.com:444/123/posts/456',
    'https://facebook.com/share/p/secret',
    'https://facebook.com/123/posts/pfbidExample',
    'https://facebook.com/ads/manager?selected_ad_ids=456',
    'https://facebook.com/story.php?story_fbid=456&id=123&id=789',
    'https://facebook.com/story.php?story_fbid=456&id=123&story_fbid=999',
    'https://facebook.com/123/../123/posts/456',
  ])('recusa referencia ambigua ou URL nao suportada: %s', (reference) => {
    expect(() => facebookPostReference(reference, '123')).toThrow(
      'INVALID_POST_REFERENCE'
    );
  });
});
