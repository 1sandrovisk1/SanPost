import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { InstagramDto } from './instagram.dto';
import { FacebookDto } from './facebook.dto';
import { TumblrDto } from './tumblr.dto';
describe('DTOs dos portes sociais', () => {
  it('conserva volume zero e settings antigos', async () => {
    const audio = plainToInstance(InstagramDto, {
      post_type: 'post',
      audio: { id: '123', audio_volume: 0, video_volume: 100 },
    });
    expect(await validate(audio)).toEqual([]);
    expect(audio.audio?.audio_volume).toBe(0);
    expect(
      await validate(plainToInstance(InstagramDto, { post_type: 'post' }))
    ).toEqual([]);
  });
  it.each([-1, 101, 'NaN'])('recusa volume invalido %s', async (volume) => {
    expect(
      (
        await validate(
          plainToInstance(InstagramDto, {
            post_type: 'post',
            audio: { id: '123', audio_volume: volume },
          })
        )
      ).length
    ).toBeGreaterThan(0);
  });
  it('permite fundo vazio e IDs novos fora do catalogo', async () => {
    expect(
      await validate(
        plainToInstance(FacebookDto, { text_format_preset_id: '' })
      )
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(FacebookDto, {
          text_format_preset_id: '123456789012345678',
        })
      )
    ).toEqual([]);
    expect(
      (
        await validate(
          plainToInstance(FacebookDto, {
            text_format_preset_id: '1&access_token=bad',
          })
        )
      ).length
    ).toBeGreaterThan(0);
  });
  it('valida URLs e tamanho do titulo Tumblr', async () => {
    expect(
      await validate(
        plainToInstance(TumblrDto, {
          title: 'Titulo',
          link: 'https://example.com',
          tags: 'a,b',
        })
      )
    ).toEqual([]);
    expect(
      (
        await validate(
          plainToInstance(TumblrDto, {
            link: 'javascript:alert(1)',
            title: 'a'.repeat(4097),
          })
        )
      ).length
    ).toBeGreaterThan(0);
  });
});
