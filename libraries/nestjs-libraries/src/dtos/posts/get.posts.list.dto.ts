import {
  IsOptional,
  IsString,
  IsNumber,
  Min,
  Max,
  IsArray,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class GetPostsListDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 0;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;

  @IsOptional()
  @IsString()
  customer?: string;

  // filtro de canais acima do calendario (upstream #2205): ids separados por
  // virgula; o escopo de org/perfil continua no repositorio
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => (value ? String(value).split(',') : []))
  integrations?: string[];
}
