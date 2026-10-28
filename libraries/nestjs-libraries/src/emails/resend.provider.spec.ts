const mockSend = jest.fn();
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({ emails: { send: mockSend } })),
}));

import { ResendProvider } from './resend.provider';

describe('ResendProvider.sendEmail (upstream 1f5f24e5)', () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  it('envia com remetente, destinatario e reply_to e devolve a resposta', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    await expect(
      new ResendProvider().sendEmail(
        'to@x.com',
        'Assunto',
        '<p>oi</p>',
        'Robo',
        'from@x.com',
        'reply@x.com'
      )
    ).resolves.toEqual({ data: { id: 'email-1' }, error: null });

    expect(mockSend).toHaveBeenCalledWith({
      from: 'Robo <from@x.com>',
      to: 'to@x.com',
      subject: 'Assunto',
      html: '<p>oi</p>',
      reply_to: 'reply@x.com',
    });
  });

  it('nao manda reply_to quando nao informado', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email-1' }, error: null });

    await new ResendProvider().sendEmail(
      'to@x.com',
      'Assunto',
      '<p>oi</p>',
      'Robo',
      'from@x.com'
    );

    expect(mockSend.mock.calls[0][0]).not.toHaveProperty('reply_to');
  });

  it('lanca o erro devolvido pela API (ex.: 429) para o envio ser repetido', async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: 'rate_limit_exceeded', message: 'Too many requests' },
    });

    await expect(
      new ResendProvider().sendEmail(
        'to@x.com',
        'Assunto',
        '<p>oi</p>',
        'Robo',
        'from@x.com'
      )
    ).rejects.toThrow('rate_limit_exceeded: Too many requests');
  });

  it('nao engole falha de rede do SDK', async () => {
    const boom = new Error('socket hang up');
    mockSend.mockRejectedValue(boom);

    await expect(
      new ResendProvider().sendEmail(
        'to@x.com',
        'Assunto',
        '<p>oi</p>',
        'Robo',
        'from@x.com'
      )
    ).rejects.toBe(boom);
  });
});
