import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { countPostContent } from '@gitroom/helpers/utils/count.length';
import { PostContent } from '../../dtos/posts/create.post.dto';

describe('contagem de texto para X Articles na API e MCP', () => {
  const article = { post_type: 'article' };

  it('aceita corpo com 60 mil caracteres CJK sem peso de tweet', () => {
    const body = `<p>${'漢'.repeat(60000)}</p>`;
    expect(countPostContent('x', body, article)).toBe(60000);
    expect(countPostContent('x', body, article)).toBeLessThan(100000);
  });

  it('aceita corpo em negrito sem converter caracteres para Unicode de tweet', () => {
    const body = `<p><strong>${'a'.repeat(60000)}</strong></p>`;
    expect(countPostContent('x', body, article)).toBe(60000);
  });

  it('conta URL completa no artigo em vez do encurtamento de tweet', () => {
    const url = `https://example.com/${'a'.repeat(100)}`;
    expect(countPostContent('x', `<p>${url}</p>`, article)).toBe(url.length);
    expect(countPostContent('x', `<p>${url}</p>`)).toBe(23);
  });

  it('resposta conserva o limite e o peso de tweet mesmo em artigo', () => {
    expect(countPostContent('x', `<p>${'a'.repeat(201)}</p>`, article, 1)).toBe(
      201
    );
    expect(
      countPostContent('x', `<p>${'a'.repeat(201)}</p>`, article, 1)
    ).toBeGreaterThan(200);
    expect(countPostContent('x', '<p>漢漢</p>', article, 1)).toBe(4);
  });

  it('post comum continua usando o peso de tweet', () => {
    expect(countPostContent('x', '<p>漢漢</p>', { post_type: 'post' })).toBe(4);
    expect(countPostContent('x', '<p>漢漢</p>')).toBe(4);
  });

  it('provider alternativo nao recebe excecao de contagem de artigo nativo', () => {
    expect(countPostContent('zernio-twitter', '<p>漢漢</p>', article)).toBe(4);
  });

  it('Threads conserva contagem em bytes UTF8', () => {
    expect(countPostContent('threads', '<p>á😀</p>', article)).toBe(6);
  });

  it('conta entidades como texto e remove estrutura HTML do artigo', () => {
    expect(
      countPostContent('x', '<h1>Oi</h1><p>&lt;img&gt;</p>', article)
    ).toBe(7);
  });

  it('transformacao do DTO conserva listas ordenadas sem reabrir tags escapadas', () => {
    const raw = '<ol><li>Um</li><li>&lt;img src=x&gt;</li></ol>';
    const value = plainToInstance(PostContent, { content: raw, image: [] });
    expect(value.content).toBe(raw);
  });
});
