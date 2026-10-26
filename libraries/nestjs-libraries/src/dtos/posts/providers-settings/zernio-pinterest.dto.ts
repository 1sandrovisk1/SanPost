import {
  IsDefined,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { JSONSchema } from 'class-validator-jsonschema';

// Contrato anterior do PinterestSettingsDto, sem a exigencia de board
// numerico: o ZernioBaseProvider repassa `settings` ao Zernio sem mapear
// `board` para `boardId`, e o Zernio publica no primeiro board da conta.
// Mapear board -> boardId e um follow-up; ate la o valor e validado como
// string obrigatoria (como sempre foi) e ignorado pelo Zernio.
export class ZernioPinterestSettingsDto {
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
  @MinLength(1, {
    message: 'Board is required',
  })
  @JSONSchema({
    description: 'board must be an id',
  })
  board: string;
}
