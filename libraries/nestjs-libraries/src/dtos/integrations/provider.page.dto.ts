import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

// id de pagina/conta pode chegar como numero (ex.: LinkedIn); vira texto
const asText = ({ value }: { value: unknown }) =>
  typeof value === 'number' ? String(value) : value;

// ids de pagina/conta/local vao para a URL da API do provider: so letras,
// numeros e _-:./ (caminhos do GMB), sem `..`, `?`, `#` ou espacos
const SAFE_ID = /^(?!.*\.\.)[A-Za-z0-9_\-:./]+$/;
// pagina do Facebook/LinkedIn e pagina do Instagram: so o id, sem caminho
const PLAIN_ID = /^[A-Za-z0-9_-]+$/;

// Escolha da pagina/conta no 2o passo da conexao (Facebook, Instagram,
// LinkedIn Page, YouTube, GMB). So estes campos chegam ao
// fetchPageInformation do provider; o resto do corpo e descartado.
export class ProviderPageDto {
  // a rota publica (sem login) autentica pelo state do OAuth
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Matches(/^[A-Za-z0-9_-]+$/)
  state?: string;

  @IsOptional()
  @Transform(asText)
  @IsString()
  @MaxLength(512)
  @Matches(PLAIN_ID)
  page?: string;

  @IsOptional()
  @Transform(asText)
  @IsString()
  @MaxLength(512)
  @Matches(SAFE_ID)
  id?: string;

  @IsOptional()
  @Transform(asText)
  @IsString()
  @MaxLength(512)
  @Matches(PLAIN_ID)
  pageId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(SAFE_ID)
  accountName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  @Matches(SAFE_ID)
  locationName?: string;
}
