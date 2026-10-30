jest.mock('@gitroom/nestjs-libraries/database/prisma/organizations/organization.service', () => ({ OrganizationService: class {} }));
import { EmailActivity } from './email.activity';
import { EmailDeliveryError } from '@gitroom/nestjs-libraries/emails/email.delivery.error';

describe('EmailActivity.sendEmail', () => {
  it('falha final e nao repetivel tambem para a fila legada', async () => {
    const sendEmailSync = jest.fn().mockRejectedValue(new EmailDeliveryError(false));
    const activity = new EmailActivity({sendEmailSync} as any, {} as any);
    await expect(activity.sendEmail('to@example.com', 'A', 'H')).rejects.toMatchObject({nonRetryable: true, message: 'Email delivery failed'});
  });
  it('preserva retorno do envio bem sucedido', async () => {
    const sendEmailSync = jest.fn().mockResolvedValue(undefined);
    const activity = new EmailActivity({sendEmailSync} as any, {} as any);
    await expect(activity.sendEmail('to@example.com', 'A', 'H')).resolves.toBeUndefined();
  });
});
