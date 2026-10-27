import {
  extractBasicCredentials,
  resolveClientCredentials,
} from './oauth-types';

const basic = (id: string, secret: string) =>
  'Basic ' +
  Buffer.from(
    `${encodeURIComponent(id)}:${encodeURIComponent(secret)}`
  ).toString('base64');

// client_secret_basic no /oauth/token (upstream #2093)
describe('extractBasicCredentials', () => {
  it('decodifica id e segredo url-encoded, com prefixo em qualquer caixa', () => {
    expect(extractBasicCredentials(basic('pca_1', 's:e/c'))).toEqual({
      clientId: 'pca_1',
      clientSecret: 's:e/c',
    });
    expect(
      extractBasicCredentials(basic('a', 'b').replace('Basic', 'BASIC'))
    ).toEqual({ clientId: 'a', clientSecret: 'b' });
  });

  it('ignora Bearer, header vazio, sem separador ou com encoding invalido', () => {
    expect(extractBasicCredentials('Bearer abc')).toBeUndefined();
    expect(extractBasicCredentials(undefined)).toBeUndefined();
    expect(extractBasicCredentials('Basic ')).toBeUndefined();
    expect(
      extractBasicCredentials('Basic ' + Buffer.from('semseparador').toString('base64'))
    ).toBeUndefined();
    expect(
      extractBasicCredentials('Basic ' + Buffer.from('%E0%A4%A:x').toString('base64'))
    ).toBeUndefined();
  });
});

describe('resolveClientCredentials', () => {
  it('aceita header (basic) ou corpo (post)', () => {
    expect(resolveClientCredentials(basic('id', 'sec'), {})).toEqual({
      clientId: 'id',
      clientSecret: 'sec',
    });
    expect(
      resolveClientCredentials(undefined, { client_id: 'id', client_secret: 'sec' })
    ).toEqual({ clientId: 'id', clientSecret: 'sec' });
  });

  it('recusa client_id diferente no header e no corpo, e falta de id ou segredo', () => {
    expect(
      resolveClientCredentials(basic('id-a', 'sec'), { client_id: 'id-b' })
    ).toBeUndefined();
    expect(resolveClientCredentials(undefined, { client_id: 'id' })).toBeUndefined();
    expect(resolveClientCredentials(undefined, {})).toBeUndefined();
  });
});
