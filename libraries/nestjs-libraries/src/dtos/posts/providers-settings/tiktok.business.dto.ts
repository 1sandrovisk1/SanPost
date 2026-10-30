import {
  IsDefined,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { JSONSchema } from 'class-validator-jsonschema';
import { TikTokDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/tiktok.dto';

// Campos de exibicao (titulo, artista, capa, endereco) so servem ao compositor:
// o publish usa id, volumes e nome da localizacao. Limitados aqui porque ficam
// gravados no post e sao mostrados a outros membros (a capa vira <img src>).
export class TikTokBusinessMusic {
  @IsDefined()
  @IsString()
  @MaxLength(200)
  @JSONSchema({
    description:
      'The commercial music library track id, taken from the "id" returned by the musicSearch function.',
  })
  id: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  artist?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((o) => !!o.image)
  @MaxLength(2048)
  @IsUrl({ protocols: ['https'], require_protocol: true })
  image?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  audio_volume?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  video_volume?: number;
}

export class TikTokBusinessLocation {
  @IsDefined()
  @IsString()
  @MaxLength(200)
  @JSONSchema({
    description:
      'The location tag id, taken from the "id" returned by the locationSearch function.',
  })
  id: string;

  @IsDefined()
  @IsString()
  @MaxLength(300)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;
}

// Canal `tiktok-business` (TikTok API for Business, v1.3). Mesmo contrato do
// TikTokDto, mais musica e localizacao, que so existem nessa API. Divergencia
// do upstream: la os dois campos entraram no proprio TikTokDto; aqui ficam numa
// classe separada para o TikTok nativo e o `zernio-tiktok` (que reusam o
// TikTokDto) nao anunciarem campos que ignoram (pitfall 15 do CLAUDE.md dos
// providers). Musica e localizacao so valem em DIRECT_POST.
export class TikTokBusinessDto extends TikTokDto {
  @Type(() => TikTokBusinessMusic)
  @ValidateNested()
  @IsOptional()
  @JSONSchema({
    description:
      'Only when content_posting_method=DIRECT_POST. Attaches a commercial music library track to the post (use the musicSearch function to find one). audio_volume / video_volume (0-100, default 50) apply to video posts only. For photos, ignored when autoAddMusic is "yes" (a random track is attached instead).',
  })
  music?: TikTokBusinessMusic;

  @Type(() => TikTokBusinessLocation)
  @ValidateNested()
  @IsOptional()
  @JSONSchema({
    description:
      'Only when content_posting_method=DIRECT_POST. Tags the post with a location (use the locationSearch function to find one).',
  })
  location?: TikTokBusinessLocation;
}
