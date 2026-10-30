import {
  IsBoolean,
  IsIn,
  IsOptional,
  Matches,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';
import { MediaDto } from '../../media/media.dto';

export class XDto {
  @IsOptional()
  @Matches(/^(https:\/\/x\.com\/i\/communities\/\d+)?$/, {
    message:
      'Invalid X community URL. It should be in the format: https://x.com/i/communities/1493446837214187523',
  })
  community?: string;

  @ValidateIf((o) => o.post_type !== 'article')
  @IsIn(['everyone', 'following', 'mentionedUsers', 'subscribers', 'verified'])
  who_can_reply_post:
    | 'everyone'
    | 'following'
    | 'mentionedUsers'
    | 'subscribers'
    | 'verified';

  @IsOptional()
  @IsIn(['post', 'article'])
  @JSONSchema({
    description:
      'post = regular tweet; article = long-form native X article with HTML paragraphs, headings, lists, bold, underline, links and own uploaded images. Article body limit 100000 characters; replies retain tweet limits.',
  })
  post_type?: 'post' | 'article';

  @ValidateIf((o) => o.post_type === 'article')
  @IsString()
  @Matches(/\S/, { message: 'Article title is required' })
  @MaxLength(1000)
  article_title?: string;

  @ValidateIf((o) => o.post_type === 'article')
  @IsIn(['draft', 'published'])
  @JSONSchema({
    description:
      'draft sends a draft to X, with no public tweet and no replies; published creates and publishes the article. Both are external actions, distinct from a local draft.',
  })
  article_status?: 'draft' | 'published';

  @IsOptional()
  @ValidateNested()
  @Type(() => MediaDto)
  article_cover?: MediaDto;

  @IsOptional()
  @IsBoolean()
  made_with_ai?: boolean;

  @IsOptional()
  @IsBoolean()
  paid_partnership?: boolean;
}
