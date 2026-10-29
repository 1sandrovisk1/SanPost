import { EmailDeliveryError } from './email.delivery.error';
import { Resend } from 'resend';
import { EmailInterface } from '@gitroom/nestjs-libraries/emails/email.interface';

const resend = new Resend(process.env.RESEND_API_KEY || 're_132');

export class ResendProvider implements EmailInterface {
  name = 'resend';
  validateEnvKeys = ['RESEND_API_KEY'];
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    emailFromName: string,
    emailFromAddress: string,
    replyTo?: string
  ) {
    const sends = await resend.emails.send({
      from: `${emailFromName} <${emailFromAddress}>`,
      to,
      subject,
      html,
      ...(replyTo && { reply_to: replyTo }),
    });

    // application_error tambem representa rede sem resposta no SDK: nao repetir.
    // O SDK devolve erros da API (ex.: 429 de rate limit) em vez de lancar:
    // lanca para o EmailService.sendEmailSync repetir o envio (upstream
    // 1f5f24e5). Antes o erro era engolido e o e-mail se perdia em silencio.
    if (sends.error) {
      throw new EmailDeliveryError(
        ['rate_limit_exceeded', 'internal_server_error'].includes(
          sends.error.name
        )
      );
    }

    return sends;
  }
}
