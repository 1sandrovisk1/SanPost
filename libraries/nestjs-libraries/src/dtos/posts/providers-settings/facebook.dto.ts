import { IsOptional, ValidateIf, IsUrl, IsIn, IsString } from 'class-validator';

export class FacebookDto {
  // Tipo de publicacao: feed/reel (padrao) ou story.
  // Opcional para retrocompatibilidade: posts agendados antes desta feature
  // nao carregam o campo, e o provider trata a ausencia como 'post'.
  @IsIn(['post', 'story'])
  @IsOptional()
  post_type?: 'post' | 'story';

  @IsOptional()
  @ValidateIf((p) => p.url)
  @IsUrl()
  url?: string;

  // Titulo do video (apenas posts de video que nao sao story).
  @IsOptional()
  @IsString()
  title?: string;
}
