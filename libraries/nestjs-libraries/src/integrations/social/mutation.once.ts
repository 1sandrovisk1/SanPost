import { ssrfSafeFetch } from '../../dtos/webhooks/ssrf.safe.dispatcher';
import { readResponseBodyWithLimit } from '../../upload/bounded.response.reader';
import { BadBody } from '../social.abstract';

/** A create request with an uncertain result must never be automatically replayed. */
export async function socialMutationOnce(
  identifier: string,
  url: string,
  options: Parameters<typeof ssrfSafeFetch>[1]
) {
  try {
    const response = await ssrfSafeFetch(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
    });
    const buffer = await readResponseBodyWithLimit(response, 128 * 1024);
    const body = JSON.parse(buffer.toString('utf8'));
    if (response.status >= 500) throw new Error('uncertain');
    return { body, status: response.status, ok: response.ok };
  } catch {
    throw new BadBody(
      identifier,
      '{}',
      '{}',
      'Não foi possível confirmar a publicação. Confira o canal antes de tentar novamente.'
    );
  }
}
