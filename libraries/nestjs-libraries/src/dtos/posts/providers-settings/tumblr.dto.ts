import {
  IsOptional,
  IsString,
  MaxLength,
  IsUrl,
  ValidateIf,
} from 'class-validator';
export class TumblrDto {
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  title?: string;
  @IsOptional()
  @ValidateIf((o) => !!o.link)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  link?: string;
  @IsOptional()
  @ValidateIf((o) => !!o.sourceUrl)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  sourceUrl?: string;
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  tags?: string;
}
