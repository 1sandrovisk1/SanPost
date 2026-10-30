// Apenas recusas explicitas do provider podem ser repetidas com seguranca.
// A mensagem fixa impede que corpo, destinatario ou credencial entrem no historico.
export class EmailDeliveryError extends Error {
  constructor(readonly retryable: boolean) {
    super('Email delivery failed');
    this.name = 'EmailDeliveryError';
  }
}
