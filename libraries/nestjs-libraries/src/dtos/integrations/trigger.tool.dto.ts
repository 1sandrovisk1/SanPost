import { IsObject, IsString, MaxLength } from 'class-validator';

// Corpo de POST /public/v1/integration-trigger/:id: o methodName passa pela
// allowlist de @Tool do provider, mas o corpo era um tipo inline (sem pipe).
export class TriggerToolDto {
  @IsString()
  @MaxLength(100)
  methodName: string;

  @IsObject()
  data: Record<string, string>;
}
