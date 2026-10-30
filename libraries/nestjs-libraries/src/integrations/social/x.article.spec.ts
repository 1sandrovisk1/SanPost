import {
  articleContentState,
  articleImageUrls,
  xArticleError,
} from './x.article';

describe('contrato e conteudo de X Articles', () => {
  beforeEach(() => {
    process.env.FRONTEND_URL = 'https://app.test';
  });
  const settings = {
    post_type: 'article',
    article_title: 'Titulo',
    article_status: 'published',
  };
  it('converte formatacao, links seguros, listas e h3 com offsets UTF16', () => {
    const state = articleContentState(
      '<h3>Titulo</h3><p>😀 <strong>oi</strong> <u>sim</u> <a href="https://example.com">link</a><a href="javascript:alert(1)">nao</a></p><ol><li>Um</li><li>Dois</li></ol>'
    );
    expect(state.blocks.map((b) => b.type)).toEqual([
      'header-two',
      'unstyled',
      'ordered-list-item',
      'ordered-list-item',
    ]);
    expect(state.blocks[1].inline_style_ranges).toContainEqual({
      offset: 3,
      length: 2,
      style: 'bold',
    });
    expect(state.blocks[1].inline_style_ranges).toContainEqual({
      offset: 6,
      length: 3,
      style: 'underline',
    });
    expect(state.entities).toHaveLength(1);
    expect(state.entities[0].value.data.url).toBe('https://example.com');
    expect(state.blocks.every((b) => !('depth' in b))).toBe(true);
  });
  it('somente imagens proprias viram blocos e a capa nao entra no corpo', () => {
    const html =
      '<p>A</p><img src="https://app.test/uploads/a.png"><img src="https://outside.test/pixel.png"><p>B</p>';
    expect(articleImageUrls(html)).toEqual(['https://app.test/uploads/a.png']);
    const state = articleContentState(html, ['22'], {
      'https://app.test/uploads/a.png': '11',
    });
    expect(state.blocks.map((b) => b.type)).toEqual([
      'unstyled',
      'atomic',
      'unstyled',
      'atomic',
    ]);
    expect(
      state.entities.map((e) => e.value.data.media_items?.[0]?.media_id)
    ).toEqual(['11', '22']);
  });
  it('aceita artigo longo e aplica limite de tweet as respostas', () => {
    expect(
      xArticleError(settings, [[]], ['a'.repeat(10000)], true, false)
    ).toBeUndefined();
    expect(
      xArticleError(settings, [[], []], ['Corpo', 'a'.repeat(201)], true, false)
    ).toMatch(/resposta/i);
  });
  it('recusa imagem inline em resposta para evitar perda silenciosa', () => {
    expect(xArticleError(settings,[[],[]],['Corpo','<p>Resposta</p><img src="https://app.test/uploads/a.png">'],true,false)).toMatch(/anexos/);
  });
  it.each([
    [{ ...settings, article_title: '   ' }, [[]], ['Corpo'], true],
    [
      { ...settings, article_status: 'draft' },
      [[], []],
      ['Corpo', 'Resposta'],
      true,
    ],
    [
      settings,
      [[{ path: 'https://app.test/uploads/a.MP4?x=1' }]],
      ['Corpo'],
      true,
    ],
    [settings, [[]], ['Corpo'], false],
  ])(
    'recusa contrato incompativel antes do envio',
    (s, media, content, native) => {
      expect(xArticleError(s, media, content, native, false)).toEqual(
        expect.any(String)
      );
    }
  );
});
