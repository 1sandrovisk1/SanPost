import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

// Query de `GET /integrations/telegram/updates` (polling do /connect).
export class TelegramUpdatesDto {
  @IsString()
  @Matches(/^[A-Za-z0-9]{4,32}$/)
  word: string;

  // offset do getUpdates; chega como string da query
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  id?: number;
}
