import { IsOptional, IsString } from 'class-validator';

// Upstream #1880: DTO ligado ao provider (settings validados no MCP/API) e
// submolt opcional (o Moltbook publica no feed geral sem ele).
export class MoltbookDto {
  @IsOptional()
  @IsString()
  submolt?: string;
}
