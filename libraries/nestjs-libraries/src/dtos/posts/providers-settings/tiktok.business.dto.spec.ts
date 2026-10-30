import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { TikTokBusinessDto } from './tiktok.business.dto';
import { allProviders } from './all.providers.settings';
import { getValidationSchemas } from '@gitroom/nestjs-libraries/chat/validation.schemas.helper';

const base = {
  title: '',
  privacy_level: 'PUBLIC_TO_EVERYONE',
  duet: false,
  stitch: false,
  comment: true,
  autoAddMusic: 'no',
  brand_content_toggle: false,
  brand_organic_toggle: false,
  content_posting_method: 'DIRECT_POST',
};

const errorsOf = async (value: Record<string, unknown>) =>
  validate(plainToInstance(TikTokBusinessDto, { ...base, ...value }));

describe('TikTokBusinessDto', () => {
  it('musica e localizacao sao opcionais', async () => {
    await expect(errorsOf({})).resolves.toHaveLength(0);
  });

  it('aceita faixa com volumes de 0 a 100 (string do formulario convertida)', async () => {
    await expect(
      errorsOf({
        music: { id: 'clip-1', audio_volume: '0', video_volume: 100 },
        location: { id: 'loc-1', name: 'Sao Paulo' },
      })
    ).resolves.toHaveLength(0);
  });

  it('recusa volume fora da faixa e faixa sem id', async () => {
    const [volume] = await errorsOf({ music: { id: 'clip-1', audio_volume: 150 } });
    expect(volume.property).toBe('music');
    const [noId] = await errorsOf({ music: { title: 'x' } });
    expect(noId.property).toBe('music');
  });

  it('capa da faixa so aceita URL https; vazia passa', async () => {
    const [http] = await errorsOf({
      music: { id: 'clip-1', image: 'http://rastreio.example/p.gif' },
    });
    expect(http.property).toBe('music');
    const [script] = await errorsOf({
      music: { id: 'clip-1', image: 'javascript:alert(1)' },
    });
    expect(script.property).toBe('music');
    await expect(
      errorsOf({
        music: { id: 'clip-1', image: 'https://p16.tiktokcdn.com/a.jpg' },
      })
    ).resolves.toHaveLength(0);
    await expect(
      errorsOf({ music: { id: 'clip-1', image: '' } })
    ).resolves.toHaveLength(0);
  });

  it('textos de exibicao tem limite de tamanho', async () => {
    const [music] = await errorsOf({
      music: { id: 'clip-1', title: 'x'.repeat(301) },
    });
    expect(music.property).toBe('music');
    const [location] = await errorsOf({
      location: { id: 'loc-1', name: 'x', address: 'y'.repeat(501) },
    });
    expect(location.property).toBe('location');
  });

  it('localizacao exige id e nome', async () => {
    const [error] = await errorsOf({ location: { id: 'loc-1' } });
    expect(error.property).toBe('location');
  });

  it('herda as regras do TikTokDto', async () => {
    const [error] = await errorsOf({ content_posting_method: 'OUTRO' });
    expect(error.property).toBe('content_posting_method');
  });

  it('schema do MCP inclui os campos herdados e os objetos de musica/localizacao', () => {
    const schema = getValidationSchemas()['TikTokBusinessDto'] as any;
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining([
        'privacy_level',
        'content_posting_method',
        'music',
        'location',
      ])
    );
    expect(schema.properties.music.properties.id.description).toMatch(
      /musicSearch/
    );
    expect(schema.properties.location.properties.id.description).toMatch(
      /locationSearch/
    );
  });

  it('tiktok-business usa o DTO proprio; nativo e Zernio seguem no TikTokDto', () => {
    const map = Object.fromEntries(
      allProviders().map((p) => [p.name, p.value])
    );
    expect(map['tiktok-business']).toBe(TikTokBusinessDto);
    expect(map['tiktok']).not.toBe(TikTokBusinessDto);
    expect(map['zernio-tiktok']).not.toBe(TikTokBusinessDto);
  });
});
