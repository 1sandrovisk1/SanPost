import { BadBody } from '../social.abstract';
import { PostDetails } from './social.integrations.interface';
import { ZernioBaseProvider } from '@gitroom/nestjs-libraries/integrations/social/zernio.base.provider';

export class ZernioInstagramProvider extends ZernioBaseProvider {
  protected override assertPublishable(posts: PostDetails[]): void {
    if (posts.some((p) => (p.settings as any)?.audio))
      throw new BadBody(
        this.identifier,
        '{}',
        '{}',
        'Esta configuração está disponível somente no canal nativo.'
      );
  }
  constructor() {
    super('instagram', 'Instagram', 2200);
  }
}
