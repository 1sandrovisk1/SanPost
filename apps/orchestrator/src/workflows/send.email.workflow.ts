import {
  proxyActivities,
  setHandler,
  condition,
  sleep,
  continueAsNew,
} from '@temporalio/workflow';
import { EmailActivity } from '@gitroom/orchestrator/activities/email.activity';
import {
  SendEmail,
  sendEmailSignal,
} from '@gitroom/orchestrator/signals/send.email.signal';
import { emailQueues } from '@gitroom/nestjs-libraries/temporal/email.queues';

const { sendEmail } = proxyActivities<EmailActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: 'main',
  cancellationType: 'ABANDON',
});

const { sendEmail: sendPriorityEmail } = proxyActivities<EmailActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: emailQueues.priority.taskQueue,
  cancellationType: 'ABANDON',
});

const { sendEmail: sendBulkEmail } = proxyActivities<EmailActivity>({
  startToCloseTimeout: '10 minute',
  taskQueue: emailQueues.bulk.taskQueue,
  cancellationType: 'ABANDON',
});

// Um workflow por e-mail (upstream 1f5f24e5): o limite de envio fica nas filas
// de e-mail (temporal.module.ts), nao num singleton que serializava tudo — um
// envio travado ou um historico grande nao seguram mais os outros e-mails.
export async function sendSingleEmailWorkflow(email: SendEmail) {
  const send = email.addTo === 'top' ? sendPriorityEmail : sendBulkEmail;
  await send(email.to, email.subject, email.html, email.replyTo, email.lang);
}

const RATE_LIMIT_MS = 700;

// Obsoleto: nao e mais iniciado (EmailService.sendEmail usa
// sendSingleEmailWorkflow). Continua registrado, e com o codigo intacto, para o
// `send_email` em execucao drenar a fila e o replay do historico dele seguir
// deterministico. Pode sair quando nenhuma execucao `send_email` estiver aberta.
export async function sendEmailWorkflow({
  queue = [],
}: {
  queue: SendEmail[];
}) {
  let processedThisRun = 0;
  // Handle incoming email signals
  setHandler(sendEmailSignal, (addEmail: SendEmail) => {
    if (addEmail.to && addEmail.subject) {
      if (addEmail.addTo === 'top') {
        queue.unshift(addEmail);
      } else {
        queue.push(addEmail);
      }
    }
  });

  // Process emails with rate limiting
  while (true) {
    // Wait until there's an email in the queue or timeout after 1 hour of inactivity
    await condition(() => queue.length > 0);

    try {
      const email = queue.shift()!;
      if (!email) {
        continue;
      }
      await sendEmail(
        email.to,
        email.subject,
        email.html,
        email.replyTo,
        email.lang
      );
      processedThisRun++;
    } catch (err) {
      console.log(err);
    }

    await sleep(RATE_LIMIT_MS);

    if (processedThisRun >= 30) {
      return await continueAsNew({ queue });
    }
  }
}
