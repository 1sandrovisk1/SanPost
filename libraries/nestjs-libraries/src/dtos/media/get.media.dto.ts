import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

// Query de `GET /public/v1/media` (porte do upstream #1926).
export class GetMediaDto {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(1000)
  page?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
