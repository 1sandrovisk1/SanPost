import { redactSecrets } from '@gitroom/nestjs-libraries/services/error.summary';

/**
 * `Post.error` guarda a falha serializada do workflow (pode conter corpo de
 * resposta do provider, tokens, URLs assinadas). A listagem de posts
 * (calendario e `GET /public/v1/posts`) so recebe a mensagem curada de um
 * `bad_body` — vinda do `handleErrors` do provider ou de um throw escrito a
 * mao; respostas sem mapeamento carregam o placeholder "Unknown Error".
 * Qualquer outra coisa vira `null`. Alguns providers interpolam o texto de
 * erro da API na mensagem (Reddit, VK, Slack, Lemmy, Telegram...), entao ela
 * ainda passa pela mesma redacao dos logs. (porte do upstream #2119)
 */
export function curatedPostError(error?: string | null): string | null {
  if (!error) {
    return null;
  }
  try {
    const parsed = JSON.parse(error);
    const [type, message] = parsed?.cause?.failure?.message
      ? [parsed?.cause?.type, parsed?.cause?.failure?.message]
      : [
          parsed?.failure?.cause?.applicationFailureInfo?.type,
          parsed?.failure?.cause?.message,
        ];
    return type === 'bad_body' && message && message !== 'Unknown Error'
      ? redactSecrets(String(message))
      : null;
  } catch {
    return null;
  }
}
