import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { XDto } from '../../dtos/posts/providers-settings/x.dto';
import { stripHtmlValidation } from '@gitroom/helpers/utils/strip.html.validation';
describe('DTO compartilhado de X Articles', () => {
  const article = {
    post_type: 'article',
    article_title: 'Titulo',
    article_status: 'draft',
  };
  it('artigo dispensa configuracao de resposta exclusiva de tweet', async () => {
    expect(await validate(plainToInstance(XDto, article))).toEqual([]);
  });
  it.each([
    { ...article, article_title: '  ' },
    { ...article, article_title: undefined },
    { ...article, article_status: 'invalid' },
    { ...article, article_title: 'a'.repeat(1001) },
  ])('recusa artigo malformado', async (raw) => {
    expect((await validate(plainToInstance(XDto, raw))).length).toBeGreaterThan(
      0
    );
  });
  it('post legado continua exigindo who_can_reply_post', async () => {
    expect((await validate(plainToInstance(XDto, {}))).length).toBeGreaterThan(
      0
    );
    expect(
      await validate(plainToInstance(XDto, { who_can_reply_post: 'everyone' }))
    ).toEqual([]);
  });
  it('pipeline HTML preserva lista ordenada e texto escapado', () => {
    expect(
      stripHtmlValidation('html', '<ol><li>&lt;img src=x&gt;</li></ol>')
    ).toBe('<ol><li>&lt;img src=x&gt;</li></ol>');
  });
});
