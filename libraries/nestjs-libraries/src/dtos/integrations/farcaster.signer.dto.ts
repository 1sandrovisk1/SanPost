import { IsString, Matches } from 'class-validator';

// Polling do managed signer do Farcaster: o requestId opaco vai no corpo (nunca
// na query string) e o signer_uuid nao sai do servidor.
export class FarcasterSignerStatusDto {
  @IsString()
  @Matches(/^[A-Za-z0-9]{32}$/)
  requestId: string;
}

// Conexao de canal: o state do /integrations/social/wrapcast amarra o signer ao
// fluxo (org/perfil) de quem o criou.
export class FarcasterChannelSignerDto {
  @IsString()
  @Matches(/^[A-Za-z0-9]{8,64}$/)
  state: string;
}
