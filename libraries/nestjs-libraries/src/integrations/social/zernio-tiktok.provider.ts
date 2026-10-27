import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';
import { BadBody } from '@gitroom/nestjs-libraries/integrations/social.abstract';
import { PostDetails } from '@gitroom/nestjs-libraries/integrations/social/social.integrations.interface';
import {
  isTikTokPhotoPost,
  tiktokCaptionTooLong,
  TIKTOK_VIDEO_CAPTION_LIMIT,
} from '@gitroom/nestjs-libraries/integrations/social/tiktok.caption';

export class ZernioTikTokProvider extends ZernioBaseProvider {
  constructor() {
    super('tiktok', 'TikTok', TIKTOK_VIDEO_CAPTION_LIMIT);
  }

  protected override assertPublishable(postDetails: PostDetails[]): void {
    const [firstPost] = postDetails;
    const tooLong = tiktokCaptionTooLong(
      firstPost?.message || '',
      isTikTokPhotoPost(firstPost?.media)
    );
    if (tooLong) {
      throw new BadBody(
        this.identifier,
        JSON.stringify({ length: (firstPost?.message || '').length }),
        Buffer.from('{}'),
        tooLong
      );
    }
  }
}
