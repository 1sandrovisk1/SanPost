import {
  IsDefined,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

export class PinterestSettingsDto {
  @IsString()
  @ValidateIf((o) => !!o.title)
  @MaxLength(100)
  title: string;

  @IsString()
  @ValidateIf((o) => !!o.link)
  @IsUrl()
  link: string;

  @IsString()
  @ValidateIf((o) => !!o.dominant_color)
  dominant_color: string;

  @IsDefined({
    message: 'Board is required',
  })
  @IsString({
    message: 'Board is required',
  })
  // Acima do MinLength de proposito: os decorators registram de baixo para
  // cima e o Select do compositor mostra so a primeira mensagem — board vazio
  // continua "Board is required", nome de board ganha a orientacao do id.
  @Matches(/^\d+$/, {
    message:
      'Board must be the numeric board id (use the boards list of the channel to find it), not the board name',
  })
  @MinLength(1, {
    message: 'Board is required',
  })
  @JSONSchema({
    description:
      'The numeric id of the board (from the boards list of the channel), not the board name',
  })
  board: string;
}
