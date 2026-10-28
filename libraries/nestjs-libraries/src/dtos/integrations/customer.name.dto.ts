import { IsString, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

// renomear grupo de canais (upstream #2183)
export class CustomerNameDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;
}
