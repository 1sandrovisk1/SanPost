import { curatedPostError } from './post.error.curation';

// Porte do upstream #2119: Post.error guarda a falha serializada do workflow
// (pode trazer corpo de resposta, tokens); calendario, API publica e MCP so
// recebem a mensagem curada de um bad_body — o resto vira null.
describe('curatedPostError', () => {
  const activityFailure = (type: string, message: string) =>
    JSON.stringify({ cause: { type, failure: { message } } });
  const protoFailure = (type: string, message: string) =>
    JSON.stringify({ failure: { cause: { message, applicationFailureInfo: { type } } } });

  it('devolve a mensagem curada de bad_body nos dois formatos', () => {
    expect(curatedPostError(activityFailure('bad_body', 'O texto passa do limite do TikTok'))).toBe(
      'O texto passa do limite do TikTok'
    );
    expect(curatedPostError(protoFailure('bad_body', 'Imagem recusada pela Meta'))).toBe(
      'Imagem recusada pela Meta'
    );
  });

  it('null para refresh_token, Unknown Error, texto cru, JSON invalido e vazio', () => {
    expect(curatedPostError(activityFailure('refresh_token', 'token expired'))).toBeNull();
    expect(curatedPostError(activityFailure('bad_body', 'Unknown Error'))).toBeNull();
    expect(curatedPostError('Channel disabled')).toBeNull();
    expect(curatedPostError('{"access_token":"SECRET"')).toBeNull();
    expect(curatedPostError(null)).toBeNull();
    expect(curatedPostError('')).toBeNull();
  });

  it('mensagem de provider que ecoa a resposta da API passa pela redacao', () => {
    expect(
      curatedPostError(activityFailure('bad_body', 'Slack rejected the post: invalid_auth token=xoxb-123456789'))
    ).not.toMatch(/xoxb-123456789/);
  });
});
