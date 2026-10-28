// Filas de activity so de e-mail, com limite de envio aplicado pelo SERVIDOR
// Temporal para todos os workers que consomem a fila (upstream 1f5f24e5). O
// Resend permite 10 requisicoes/s por time; o servidor divide o limite entre as
// 4 particoes da fila, entao depois de um periodo ocioso uma rajada pode passar
// um pouco do limite. 5/s somados mantem a rajada pequena, o envio recusado e
// repetido pelo sendEmailSync e sobra folga para o SMTP/nodemailer.
//
// Este arquivo entra no bundle do workflow (send.email.workflow.ts): so
// constantes, sem imports.
export const emailQueues = {
  // Notificacoes, cobranca, convites, ativacao e senha ('top')
  priority: { taskQueue: 'email', perSecond: 3 },
  // Resumos (digest) e streak ('bottom')
  bulk: { taskQueue: 'email-bulk', perSecond: 2 },
};
