import { sanitizePostContent } from '@gitroom/helpers/utils/sanitize.post.content';

// Porte do upstream #2289 + 2ded21d1: tags de bloco que o editor nao conhece
// viravam texto colado na linha seguinte; agora viram paragrafos, com regex
// linear mesmo para tag sem fechamento.
describe('sanitizePostContent (tags de bloco)', () => {
  it('div/section/article/blockquote/pre/h4-h6 viram paragrafos', () => {
    expect(sanitizePostContent('<div>linha 1</div><div>linha 2</div>')).toBe(
      '<p>linha 1</p><p>linha 2</p>'
    );
    expect(sanitizePostContent('<h4 class="x">titulo</h4><section>corpo</section>')).toBe(
      '<p>titulo</p><p>corpo</p>'
    );
  });

  // A remocao de tags/atributos e do DOMPurify, que no Jest e um mock
  // identidade (jest-mocks/isomorphic-dompurify.js); aqui so a reescrita.
  it('nao mexe em tags que o editor ja conhece nem em texto', () => {
    expect(sanitizePostContent('<p>a</p><ul><li>b</li></ul>')).toBe('<p>a</p><ul><li>b</li></ul>');
    expect(sanitizePostContent('texto <divisao> solto')).toBe('texto <divisao> solto');
  });

  it('tag de bloco sem fechamento nao degrada (regex linear)', () => {
    const hostile = '<div' + ' a'.repeat(50000);
    const started = Date.now();
    sanitizePostContent(hostile);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
