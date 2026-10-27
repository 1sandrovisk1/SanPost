import { IsDefined, IsOptional, IsString } from 'class-validator';

export class TokenExchangeDto {
  @IsString()
  @IsDefined()
  grant_type: string;

  @IsString()
  @IsDefined()
  code: string;

  // opcionais: client_secret_basic manda id e segredo no header
  // Authorization; o controller junta as duas fontes e recusa sem eles
  // (upstream #2093)
  @IsString()
  @IsOptional()
  client_id?: string;

  @IsString()
  @IsOptional()
  client_secret?: string;
}
