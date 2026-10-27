import { MetaAutomationGraphClient } from './meta-automation-graph.client';
import { META_FACEBOOK_GRAPH_URL } from '../social/meta-graph.constants';

describe('MetaAutomationGraphClient', () => {
  let request: jest.Mock;
  let client: MetaAutomationGraphClient;
  beforeEach(() => {
    request = jest.fn();
    client = new MetaAutomationGraphClient(request);
  });
  const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });
  const appMismatchMessage =
    '(#100) The App_id in the input_token did not match the Viewing App';

  it('identifica app divergente somente no debug sem expor a resposta bruta', async () => {
    request.mockResolvedValue(response({ error: {
      code: 100, message: ` ${appMismatchMessage} `, token: 'SECRET',
    } }, 400));
    const error = await client.read('debug_token', 'APP_SECRET', {
      input_token: 'SECRET',
    }).catch(error => error);
    expect(error).toMatchObject({
      category: 'APP_MISMATCH', message: 'APP_MISMATCH', code: 100, httpStatus: 400,
    });
    expect(JSON.stringify(error)).not.toContain('SECRET');
    expect(JSON.stringify(error)).not.toContain(appMismatchMessage);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['me', 100, 400, appMismatchMessage, 'META_REJECTED'],
    ['debug_token', 190, 400, appMismatchMessage, 'TOKEN_INVALID'],
    ['debug_token', 100, 503, appMismatchMessage, 'OUTCOME_UNKNOWN'],
    ['debug_token', 100, 403, appMismatchMessage, 'PERMISSION_DENIED'],
    ['debug_token', 100, 200, appMismatchMessage, 'META_REJECTED'],
    ['debug_token', 100, 400, `${appMismatchMessage} SECRET`, 'META_REJECTED'],
    ['debug_token', 100, 400, 'Another invalid parameter', 'META_REJECTED'],
    ['debug_token', 100, 400, undefined, 'META_REJECTED'],
  ])('preserva classificacao fora do contrato de divergencia: %s %s %s %s', async (path, code, status, message, category) => {
    request.mockResolvedValue(response({ error: { code, message } }, status));
    await expect(client.read(path, 'SECRET')).rejects.toMatchObject({ category });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('nao reclassifica divergencia de app em envio ou inscricao', async () => {
    request.mockImplementation(async () => response({ error: {
      code: 100, message: appMismatchMessage,
    } }, 400));
    expect(await client.write('123/messages', 'SECRET', {}, 'message_id'))
      .toMatchObject({ status: 'FAILED', error: { category: 'META_REJECTED' } });
    await expect(client.subscribePage('123', 'SECRET', ['feed']))
      .rejects.toMatchObject({ category: 'META_REJECTED' });
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('inscreve os campos do proprio app preservados pelo servico', async () => {
    request.mockResolvedValue(response({ success: true }));
    await client.subscribePage('123', 'SECRET', ['messages', 'feed']);
    expect(request).toHaveBeenCalledWith(`${META_FACEBOOK_GRAPH_URL}/123/subscribed_apps`, expect.objectContaining({ method: 'POST', redirect: 'error', body: JSON.stringify({ subscribed_fields: 'messages,feed' }), headers: { Authorization: 'Bearer SECRET', 'Content-Type': 'application/json' } }));
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([{ success: false }, {}, { error: { code: 190, message: 'SECRET' } }])('nao aceita confirmacao invalida de inscricao: %j', async body => {
    request.mockResolvedValue(response(body));
    await expect(client.subscribePage('123', 'SECRET', ['feed'])).rejects.toMatchObject({ category: expect.any(String) });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('nao repete inscricao apos timeout e nao propaga mensagem sensivel', async () => {
    request.mockRejectedValue(new Error('SECRET'));
    await expect(client.subscribePage('123', 'SECRET', ['feed'])).rejects.toMatchObject({ message: 'OUTCOME_UNKNOWN' });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('usa versao central, token no header, timeout e bloqueia redirects', async () => {
    request.mockResolvedValue(response({ message_id: 'mid.1' }));
    await client.write('123/messages', 'SECRET', {}, 'message_id');
    expect(request).toHaveBeenCalledWith(
      `${META_FACEBOOK_GRAPH_URL}/123/messages`,
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: {
          Authorization: 'Bearer SECRET',
          'Content-Type': 'application/json',
        },
        signal: expect.any(AbortSignal),
      })
    );
  });

  it.each([
    [
      response(
        { error: { code: 190, error_subcode: 464, message: 'SECRET' } },
        400
      ),
      'FAILED',
      'TOKEN_INVALID',
    ],
    [
      response({ error: { code: 10, message: 'SECRET' } }, 400),
      'FAILED',
      'PERMISSION_DENIED',
    ],
    [response({ error: { code: 200 } }, 403), 'FAILED', 'PERMISSION_DENIED'],
    [response({ error: { code: 613 } }, 429), 'FAILED', 'RATE_LIMITED'],
    [response({ error: { code: 100 } }, 400), 'FAILED', 'META_REJECTED'],
    [
      response({ error: { code: 2, message: 'SECRET' } }, 503),
      'UNKNOWN',
      'OUTCOME_UNKNOWN',
    ],
    [response({}), 'UNKNOWN', 'OUTCOME_UNKNOWN'],
    [
      new Response('<html>SECRET</html>', { status: 502 }),
      'UNKNOWN',
      'OUTCOME_UNKNOWN',
    ],
  ])(
    'classifica %j sem perder subcode ou repetir o envio',
    async (res, status, category) => {
      request.mockResolvedValue(res);
      const result = await client.write(
        '123/messages',
        'SECRET',
        {},
        'message_id'
      );
      expect(result).toMatchObject({ status, error: { category } });
      expect(JSON.stringify(result)).not.toContain('SECRET');
      expect(request).toHaveBeenCalledTimes(1);
      if (category === 'TOKEN_INVALID')
        expect(result).toMatchObject({ error: { code: 190, subcode: 464 } });
    }
  );

  it('trata conexao perdida como resultado desconhecido sem incluir o erro bruto', async () => {
    request.mockRejectedValue(new Error('token=SECRET request_body=PRIVATE'));
    expect(
      await client.write('123/messages', 'SECRET', {}, 'message_id')
    ).toEqual({ status: 'UNKNOWN', error: { category: 'OUTCOME_UNKNOWN' } });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('reads rejeitam erro sanitizado em vez de devolver resultado incompleto', async () => {
    request.mockResolvedValue(
      response(
        { error: { code: 190, error_subcode: 464, message: 'SECRET' } },
        400
      )
    );
    await expect(
      client.read('me', 'SECRET', { fields: 'id' })
    ).rejects.toMatchObject({
      category: 'TOKEN_INVALID',
      code: 190,
      subcode: 464,
    });
  });

  it.each([
    'https://evil.example',
    '//evil.example',
    '../me',
    '123/messages?access_token=bad',
    '123/../../me',
  ])('rejeita path arbitrario %s', async (path) => {
    await expect(client.read(path, 'SECRET')).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
