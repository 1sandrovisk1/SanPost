import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

// Id externo do post na plataforma (um unico id: digitos, urn:li:..., page_post,
// at://..., accounts/.../localPosts/..., v_pub_url~...). Hoje so o TikTok
// devolve `missing` e aceita este endpoint; antes o valor ia cru para o banco.
export class UpdateReleaseIdDto {
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  @Matches(/^[A-Za-z0-9._~:/-]+$/, {
    message: 'releaseId must be a single platform post id',
  })
  releaseId: string;
}
