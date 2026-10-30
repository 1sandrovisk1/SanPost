import { EmailDeliveryError } from '../emails/email.delivery.error';
import { EmailService } from './email.service';

describe('EmailService', () => {
  const OLD_ENV = process.env;
  let service: EmailService;
  let sent: jest.Mock;

  beforeEach(() => {
    process.env = {
      ...OLD_ENV,
      EMAIL_FROM_ADDRESS: 'from@x.com',
      EMAIL_FROM_NAME: 'Robo',
    };
    service = new EmailService({} as any);
    sent = jest.fn().mockResolvedValue('ok');
    // Substitui o provider (EmptyProvider) por um mock que captura o HTML final.
    (service as any).emailService = {
      name: 'mock',
      validateEnvKeys: [],
      sendEmail: sent,
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  describe('sendEmailSync', () => {
    it('renderiza o rodape no idioma informado (en) e mantem o corpo', async () => {
      await service.sendEmailSync(
        'to@x.com',
        'Assunto',
        '<p>corpo</p>',
        undefined,
        'en'
      );

      const html = sent.mock.calls[0][2] as string;
      expect(html).toContain('You can change your notification preferences');
      expect(html).toContain('<p>corpo</p>');
    });

    it('renderiza o rodape em pt quando lang pt', async () => {
      await service.sendEmailSync(
        'to@x.com',
        'Assunto',
        '<p>corpo</p>',
        undefined,
        'pt'
      );

      const html = sent.mock.calls[0][2] as string;
      expect(html).toContain('preferências de notificação');
    });

    it('nao envia para destinatario sem @', async () => {
      await service.sendEmailSync('invalido', 'Assunto', '<p>x</p>');
      expect(sent).not.toHaveBeenCalled();
    });

    it.each([new Error('socket hang up'), new EmailDeliveryError(false)])(
      'nao repete resultado incerto ou recusa permanente',
      async (error) => {
        sent.mockRejectedValue(error);
        await expect(
          service.sendEmailSync('to@x.com', 'Assunto', '<p>x</p>')
        ).rejects.toThrow('Email delivery failed');
        expect(sent).toHaveBeenCalledTimes(1);
      }
    );

    it('nao registra destinatario nem resposta crua do provider', async () => {
      const log = jest.spyOn(console, 'log').mockImplementation(() => {});
      sent.mockRejectedValue(new Error('to@x.com secret-provider-body'));
      await expect(
        service.sendEmailSync('to@x.com', 'Assunto', '<p>x</p>')
      ).rejects.toThrow();
      expect(JSON.stringify(log.mock.calls)).not.toMatch(
        /to@x.com|secret-provider-body/
      );
      log.mockRestore();
    });

    // o provider lanca o erro da API (ex.: 429 do Resend): repete ate 3 vezes
    it('repete o envio recusado pelo provider e para no primeiro sucesso', async () => {
      jest.useFakeTimers();
      sent
        .mockRejectedValueOnce(new EmailDeliveryError(true))
        .mockResolvedValueOnce('ok');

      const sending = service.sendEmailSync('to@x.com', 'Assunto', '<p>x</p>');
      await jest.runAllTimersAsync();
      await sending;

      expect(sent).toHaveBeenCalledTimes(2);
      jest.useRealTimers();
    });

    it('devolve falha ao Temporal depois de 3 tentativas', async () => {
      jest.useFakeTimers();
      sent.mockRejectedValue(new EmailDeliveryError(true));

      const sending = expect(
        service.sendEmailSync('to@x.com', 'Assunto', '<p>x</p>')
      ).rejects.toThrow('Email delivery failed');
      await jest.runAllTimersAsync();
      await sending;

      expect(sent).toHaveBeenCalledTimes(3);
      jest.useRealTimers();
    });
  });
});

// Porte do upstream 1f5f24e5: um workflow por e-mail no lugar do singleton
// `send_email`; o limite de envio fica nas filas de e-mail do Temporal.
describe('EmailService.sendEmail', () => {
  const build = () => {
    const start = jest.fn().mockResolvedValue({ workflowId: 'w' });
    const signalWithStart = jest.fn();
    const temporal = {
      client: {
        getRawClient: () => ({ workflow: { start, signalWithStart } }),
      },
    };
    return {
      service: new EmailService(temporal as any),
      start,
      signalWithStart,
    };
  };

  it('inicia um sendSingleEmailWorkflow por e-mail na fila main, com idioma', async () => {
    const { service, start, signalWithStart } = build();

    await service.sendEmail(
      'to@x.com',
      'Assunto',
      '<p>x</p>',
      'top',
      'reply@x.com',
      'en'
    );

    expect(signalWithStart).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith('sendSingleEmailWorkflow', {
      taskQueue: 'main',
      workflowId: expect.stringMatching(/^send_email_[0-9a-f-]{36}$/),
      args: [
        {
          to: 'to@x.com',
          subject: 'Assunto',
          html: '<p>x</p>',
          replyTo: 'reply@x.com',
          addTo: 'top',
          lang: 'en',
        },
      ],
    });
  });

  it('cada e-mail tem workflowId proprio (nada de USE_EXISTING num singleton)', async () => {
    const { service, start } = build();

    await service.sendEmail('a@x.com', 'A', '<p>a</p>', 'bottom');
    await service.sendEmail('b@x.com', 'B', '<p>b</p>', 'bottom');

    const [first, second] = start.mock.calls.map(([, options]) => options);
    expect(first.workflowId).not.toBe(second.workflowId);
    expect(first).not.toHaveProperty('workflowIdConflictPolicy');
  });

  it('sem destinatario ou assunto nao inicia workflow', async () => {
    const { service, start } = build();

    await service.sendEmail('', 'Assunto', '<p>x</p>', 'top');
    await service.sendEmail('to@x.com', '', '<p>x</p>', 'top');

    expect(start).not.toHaveBeenCalled();
  });
});
