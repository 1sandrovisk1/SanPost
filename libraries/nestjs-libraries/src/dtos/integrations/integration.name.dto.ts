import { IsDefined, IsString, MaxLength } from 'class-validator';

// nome do canal so no Robo MultiPost; vazio volta ao nome da plataforma
// (upstream #2190)
export class IntegrationNameDto {
  @IsString()
  @IsDefined()
  @MaxLength(100)
  name: string;
}
