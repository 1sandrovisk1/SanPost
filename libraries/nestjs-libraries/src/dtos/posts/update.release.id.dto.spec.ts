import 'reflect-metadata';
import { validate } from 'class-validator';
import { UpdateReleaseIdDto } from './update.release.id.dto';

const dto = (releaseId: unknown) =>
  Object.assign(new UpdateReleaseIdDto(), { releaseId });

describe('UpdateReleaseIdDto', () => {
  it.each([
    '7345678901234567891',
    'v_pub_url~v2.abc-DEF',
    'urn:li:share:7262',
    'at://did:plc:abc/app.bsky.feed.post/3kxyz',
    '123_456',
    'accounts/1/localPosts/2',
    '1700000000.000100',
  ])('aceita o id %s', async (releaseId) => {
    await expect(validate(dto(releaseId))).resolves.toHaveLength(0);
  });

  it.each(['', ' ', 'a b', '<script>', '"x"', 'x'.repeat(513), 123, null])(
    'rejeita %p',
    async (releaseId) => {
      await expect(validate(dto(releaseId))).resolves.not.toHaveLength(0);
    }
  );
});
