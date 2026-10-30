import { IsDefined, IsTimeZone, MaxLength, ValidateIf } from 'class-validator';
export class TimezoneDto {
  @ValidateIf((_object, value) => value !== null)
  @IsDefined()
  @IsTimeZone()
  @MaxLength(100)
  timezoneName: string | null;
}
