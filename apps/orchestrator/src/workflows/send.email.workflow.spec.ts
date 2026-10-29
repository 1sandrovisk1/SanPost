const mockQueues: Record<string, { sendEmail: jest.Mock }> = {};
const mockProxyOptions: Array<Record<string, unknown>> = [];
jest.mock('@temporalio/workflow', () => ({
  proxyActivities: (options: { taskQueue: string }) => {
    mockProxyOptions.push(options);
    mockQueues[options.taskQueue] = { sendEmail: jest.fn() };
    return mockQueues[options.taskQueue];
  },
  defineSignal: jest.fn((name: string) => name),
  setHandler: jest.fn(),
  condition: jest.fn(),
  sleep: jest.fn(),
  continueAsNew: jest.fn(),
}));
import { sendSingleEmailWorkflow } from './send.email.workflow';
import { emailQueues } from '@gitroom/nestjs-libraries/temporal/email.queues';

const email = {
  to: 'to@x.com',
  subject: 'Assunto',
  html: '<p>oi</p>',
  replyTo: 'reply@x.com',
  lang: 'pt',
};

describe('sendSingleEmailWorkflow (upstream 1f5f24e5)', () => {
  beforeEach(() => {
    for (const queue of Object.values(mockQueues)) {
      queue.sendEmail.mockReset();
    }
  });

  it('declara as filas de e-mail com o mesmo prazo e cancelamento do envio antigo', () => {
    expect(mockProxyOptions.map((options) => options.taskQueue)).toEqual([
      'main',
      emailQueues.priority.taskQueue,
      emailQueues.bulk.taskQueue,
    ]);
    for (const options of mockProxyOptions) {
      expect(options).toEqual(
        expect.objectContaining({
          startToCloseTimeout: '10 minute',
          cancellationType: 'ABANDON',
        })
      );
    }
  });

  it('limita a activity a uma tentativa para nao reenviar apos resultado incerto', () => {
    for (const options of mockProxyOptions.filter(
      (option) => option.taskQueue !== 'main'
    )) {
      expect(options.retry).toEqual({ maximumAttempts: 1 });
    }
  });

  it('e-mail prioritario (top) vai para a fila email com idioma', async () => {
    await sendSingleEmailWorkflow({ ...email, addTo: 'top' });

    expect(mockQueues.email.sendEmail).toHaveBeenCalledWith(
      'to@x.com',
      'Assunto',
      '<p>oi</p>',
      'reply@x.com',
      'pt'
    );
    expect(mockQueues['email-bulk'].sendEmail).not.toHaveBeenCalled();
    expect(mockQueues.main.sendEmail).not.toHaveBeenCalled();
  });

  it('resumo/streak (bottom) vai para a fila email-bulk', async () => {
    await sendSingleEmailWorkflow({ ...email, addTo: 'bottom' });

    expect(mockQueues['email-bulk'].sendEmail).toHaveBeenCalledWith(
      'to@x.com',
      'Assunto',
      '<p>oi</p>',
      'reply@x.com',
      'pt'
    );
    expect(mockQueues.email.sendEmail).not.toHaveBeenCalled();
  });

  it('falha do envio falha o workflow daquele e-mail, sem afetar outros', async () => {
    const boom = new Error('activity falhou');
    mockQueues.email.sendEmail.mockRejectedValueOnce(boom);

    await expect(
      sendSingleEmailWorkflow({ ...email, addTo: 'top' })
    ).rejects.toBe(boom);
    await expect(
      sendSingleEmailWorkflow({ ...email, addTo: 'top' })
    ).resolves.toBeUndefined();
  });
});
