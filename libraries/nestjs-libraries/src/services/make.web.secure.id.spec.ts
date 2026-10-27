import { makeWebSecureId } from './make.web.secure.id';

// Versao para o navegador do makeSecureId (sem node:crypto): Web Crypto.
describe('makeWebSecureId', () => {
  it('gera o tamanho pedido no alfabeto base62', () => {
    expect(makeWebSecureId(8)).toMatch(/^[A-Za-z0-9]{8}$/);
    expect(makeWebSecureId(0)).toBe('');
  });

  it('usa crypto.getRandomValues (nao Math.random)', () => {
    const random = jest.spyOn(Math, 'random');
    const values = jest.spyOn(globalThis.crypto, 'getRandomValues');
    makeWebSecureId(16);
    expect(values).toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
    values.mockRestore();
  });

  it('nao repete em amostras pequenas', () => {
    const set = new Set(Array.from({ length: 200 }, () => makeWebSecureId(8)));
    expect(set.size).toBe(200);
  });
});
