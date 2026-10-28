import { describe, it, expect } from 'vitest';
import { isPublishedScheduledPreview } from './shared-publication-preview';
import type { ScheduledAutomationPostView } from '@gitroom/nestjs-libraries/dtos/flows/scheduled-post.dto';
const scheduled: ScheduledAutomationPostView = {
  id: 'local',
  caption: 'Teste',
  publishDate: '2026-10-28T11:00:00Z',
  state: 'PUBLISHED',
  status: 'published',
  publishedPostIds: ['98765'],
};
describe('identidade visual do Reel agendado', () => {
  it('mantem a deduplicacao exata por ID sem consultar aliases', () => {
    expect(
      isPublishedScheduledPreview(scheduled, { id: '98765' }, 'facebook')
    ).toBe(true);
    expect(
      isPublishedScheduledPreview(scheduled, { id: '98765' }, 'instagram')
    ).toBe(true);
  });
  it.each([
    'https://www.facebook.com/reel/98765/',
    'https://facebook.com/reel/98765',
    'https://m.facebook.com/reel/98765/?source=teste',
    'https://web.facebook.com/reel/98765/',
  ])('reconhece o mesmo Reel em %s', (permalink) => {
    expect(
      isPublishedScheduledPreview(
        scheduled,
        { id: '123_456', permalink },
        'facebook'
      )
    ).toBe(true);
  });
  it.each([
    'https://www.facebook.com/reel/98766/',
    'https://www.facebook.com.evil.test/reel/98765/',
    'https://evil.test/facebook.com/reel/98765/',
    'http://www.facebook.com/reel/98765/',
    'https://name@www.facebook.com/reel/98765/',
    'https://www.facebook.com:444/reel/98765/',
    'https://www.facebook.com/reel/98765/extra',
    'https://www.facebook.com/posts/98765/',
    'invalid',
  ])('nao oculta referencia sem identidade comprovavel %s', (permalink) => {
    expect(
      isPublishedScheduledPreview(
        scheduled,
        { id: '123_456', permalink },
        'facebook'
      )
    ).toBe(false);
  });
  it('nao aplica o fallback a Instagram, agendado pendente ou ID composto por sufixo', () => {
    const remote = {
      id: '123_456',
      permalink: 'https://www.facebook.com/reel/98765/',
    };
    expect(isPublishedScheduledPreview(scheduled, remote, 'instagram')).toBe(
      false
    );
    expect(
      isPublishedScheduledPreview(
        { ...scheduled, status: 'waiting' },
        remote,
        'facebook'
      )
    ).toBe(false);
    expect(
      isPublishedScheduledPreview(
        { ...scheduled, publishedPostIds: ['123_98765'] },
        remote,
        'facebook'
      )
    ).toBe(false);
  });
});
