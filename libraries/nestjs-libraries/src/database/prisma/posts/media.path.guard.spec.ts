import { filterAllowedMedia, isAllowedMediaPath } from './media.path.guard';

describe('isAllowedMediaPath', () => {
  const uploads = '/srv/uploads';

  it('aceita midia referenciada por id (sem path) para resolver pelo banco', () => {
    expect(isAllowedMediaPath(undefined, uploads)).toBe(true);
    expect(isAllowedMediaPath(null, uploads)).toBe(true);
  });

  it('aceita URL remota http(s), que e baixada pelo cliente SSRF-safe', () => {
    expect(isAllowedMediaPath('https://cdn.exemplo.com/a.png', uploads)).toBe(true);
    expect(isAllowedMediaPath('http://cdn.exemplo.com/a.png', uploads)).toBe(true);
  });

  it('trata esquema em maiusculas como caminho local, igual aos providers', () => {
    // posts.service/providers usam indexOf('http') (case-sensitive): o valor
    // cairia no ramo local; sem barra inicial ele sai do UPLOAD_DIRECTORY.
    expect(isAllowedMediaPath('HTTPS://cdn.exemplo.com/a.png', uploads)).toBe(false);
    expect(isAllowedMediaPath('/2026/x.HTTP.png', uploads)).toBe(true);
  });

  it('aceita caminho local dentro de UPLOAD_DIRECTORY', () => {
    expect(isAllowedMediaPath('/2026/10/23/abc.png', uploads)).toBe(true);
    expect(isAllowedMediaPath('/2026/10/23/abc.png', `${uploads}/`)).toBe(true);
  });

  it('rejeita path traversal para fora de UPLOAD_DIRECTORY', () => {
    expect(isAllowedMediaPath('/../../etc/passwd', uploads)).toBe(false);
    expect(isAllowedMediaPath('/2026/../../../etc/passwd', uploads)).toBe(false);
    expect(isAllowedMediaPath('/..', uploads)).toBe(false);
  });

  it('rejeita prefixo irmao parecido e o proprio diretorio', () => {
    expect(isAllowedMediaPath('-evil/a.png', uploads)).toBe(false);
    expect(isAllowedMediaPath('/', uploads)).toBe(false);
    expect(isAllowedMediaPath('', uploads)).toBe(false);
  });

  it('rejeita "http" no meio do caminho (pularia o prefixo de UPLOAD_DIRECTORY)', () => {
    expect(isAllowedMediaPath('/2026/http/a.png', uploads)).toBe(false);
  });

  it('sem UPLOAD_DIRECTORY nenhum caminho local e permitido', () => {
    expect(isAllowedMediaPath('/2026/10/23/abc.png', undefined)).toBe(false);
    expect(isAllowedMediaPath('/2026/10/23/abc.png', '')).toBe(false);
    expect(isAllowedMediaPath('https://cdn.exemplo.com/a.png', undefined)).toBe(true);
  });
});

describe('filterAllowedMedia', () => {
  it('remove apenas os itens com path fora do permitido', () => {
    const list = [
      { id: 'a' },
      { path: 'https://cdn.exemplo.com/a.png' },
      { path: '/2026/10/23/ok.png' },
      { path: '/../../etc/passwd' },
      { path: '/x/http/y.png' },
    ];

    expect(filterAllowedMedia(list, '/srv/uploads')).toEqual([
      { id: 'a' },
      { path: 'https://cdn.exemplo.com/a.png' },
      { path: '/2026/10/23/ok.png' },
    ]);
    expect(filterAllowedMedia(undefined, '/srv/uploads')).toEqual([]);
    expect(filterAllowedMedia('nao-e-lista' as any, '/srv/uploads')).toEqual([]);
  });
});
