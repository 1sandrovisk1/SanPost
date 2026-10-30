import { BadBody } from '../social.abstract';
import { PostDetails } from './social.integrations.interface';
import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioTwitterProvider extends ZernioBaseProvider {
  protected override assertPublishable(posts: PostDetails[]): void {
    if (posts.some(p => (p.settings as any)?.post_type === 'article')) throw new BadBody(this.identifier, '{}', '{}', 'Artigos exigem uma conexão nativa do X.');
  }
  constructor() {
    super('twitter', 'Twitter/X', 280);
  }
}
