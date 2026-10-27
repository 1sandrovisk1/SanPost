import { ssrfSafeFetch } from '../../dtos/webhooks/ssrf.safe.dispatcher';
import { Injectable } from '@nestjs/common';
import { META_FACEBOOK_GRAPH_URL, META_INSTAGRAM_GRAPH_URL } from '../social/meta-graph.constants';

export type MetaAutomationErrorCategory =
  | 'TOKEN_INVALID'
  | 'APP_MISMATCH'
  | 'PERMISSION_DENIED'
  | 'RATE_LIMITED'
  | 'META_REJECTED'
  | 'OUTCOME_UNKNOWN'
  | 'INVALID_INPUT';

export interface MetaAutomationFailure {
  category: MetaAutomationErrorCategory;
  code?: number;
  subcode?: number;
  httpStatus?: number;
}

export class MetaAutomationError
  extends Error
  implements MetaAutomationFailure
{
  constructor(
    public readonly category: MetaAutomationErrorCategory,
    public readonly code?: number,
    public readonly subcode?: number,
    public readonly httpStatus?: number
  ) {
    super(category);
  }
}

export type MetaAutomationDelivery =
  | { status: 'SENT'; remoteId: string }
  | { status: 'FAILED' | 'UNKNOWN'; error: MetaAutomationFailure };

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function classify(body: unknown, status: number): MetaAutomationFailure {
  const error = record(record(body).error);
  const code = typeof error.code === 'number' ? error.code : undefined;
  const subcode =
    typeof error.error_subcode === 'number' ? error.error_subcode : undefined;
  const category: MetaAutomationErrorCategory =
    status >= 500
      ? 'OUTCOME_UNKNOWN'
      : code === 190
      ? 'TOKEN_INVALID'
      : code === 10 || code === 200 || status === 403
      ? 'PERMISSION_DENIED'
      : status === 429 || [4, 17, 32, 613].includes(code)
      ? 'RATE_LIMITED'
      : 'META_REJECTED';
  return { category, code, subcode, httpStatus: status };
}

/** Single-attempt transport. Mutation retries belong to the persisted delivery ledger. */
@Injectable()
export class MetaAutomationGraphClient {
  constructor(private readonly request: typeof fetch = ssrfSafeFetch, private readonly base = META_FACEBOOK_GRAPH_URL) {}

  private async call(
    path: string,
    token: string,
    body?: unknown,
    query: Record<string, string> = {}
  ) {
    if (
      !/^(debug_token|(?:me|\d+(?:_\d+)?)(?:\/(messages|comments|replies|media|subscribed_apps|published_posts|subscriptions))?)$/.test(
        path
      ) ||
      ![META_FACEBOOK_GRAPH_URL, META_INSTAGRAM_GRAPH_URL].includes(this.base) ||
      !token ||
      /[\r\n]/.test(token)
    )
      throw new MetaAutomationError('INVALID_INPUT');
    const url = new URL(`${this.base}/${path}`);
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, value);
    const response = await this.request(url.toString(), {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
    return { status: response.status, ok: response.ok, data };
  }

  async read(
    path: string,
    token: string,
    query: Record<string, string> = {}
  ): Promise<Record<string, unknown>> {
    let response: Awaited<ReturnType<MetaAutomationGraphClient['call']>>;
    try {
      response = await this.call(path, token, undefined, query);
    } catch (error) {
      if (error instanceof MetaAutomationError) throw error;
      throw new MetaAutomationError('OUTCOME_UNKNOWN');
    }
    if (!response.ok || record(response.data).error || !response.data) {
      const failure = classify(response.data, response.status);
      const message = record(record(response.data).error).message;
      // Meta may reject debug_token before returning app_id. Keep this diagnosis
      // specific to that read; code 100 also covers unrelated mutation failures.
      if (
        path === 'debug_token' &&
        response.status === 400 &&
        failure.code === 100 &&
        typeof message === 'string' &&
        message.trim() ===
          '(#100) The App_id in the input_token did not match the Viewing App'
      )
        failure.category = 'APP_MISMATCH';
      throw new MetaAutomationError(
        failure.category,
        failure.code,
        failure.subcode,
        failure.httpStatus
      );
    }
    return record(response.data);
  }

  async write(
    path: string,
    token: string,
    body: unknown,
    idField: 'id' | 'message_id'
  ): Promise<MetaAutomationDelivery> {
    try {
      const response = await this.call(path, token, body);
      const data = record(response.data);
      if (
        response.ok &&
        typeof data[idField] === 'string' &&
        data[idField] &&
        !data.error
      ) {
        return { status: 'SENT', remoteId: data[idField] as string };
      }
      if (response.ok || response.status >= 500 || !data.error) {
        return {
          status: 'UNKNOWN',
          error: { category: 'OUTCOME_UNKNOWN', httpStatus: response.status },
        };
      }
      return { status: 'FAILED', error: classify(data, response.status) };
    } catch (error) {
      if (
        error instanceof MetaAutomationError &&
        error.category === 'INVALID_INPUT'
      )
        throw error;
      return { status: 'UNKNOWN', error: { category: 'OUTCOME_UNKNOWN' } };
    }
  }

  async subscribePage(pageId: string, token: string, fields: string[]): Promise<void> {
    if (!/^\d{1,32}$/.test(pageId) || !fields.length || fields.some(field => !/^[a-z_]{1,80}$/.test(field)))
      throw new MetaAutomationError('INVALID_INPUT');
    try {
      const response = await this.call(`${pageId}/subscribed_apps`, token, { subscribed_fields: fields.join(',') });
      if (response.ok && record(response.data).success === true && !record(response.data).error) return;
      const error = classify(response.data, response.status);
      throw new MetaAutomationError(error.category, error.code, error.subcode, error.httpStatus);
    } catch (error) {
      if (error instanceof MetaAutomationError) throw error;
      throw new MetaAutomationError('OUTCOME_UNKNOWN');
    }
  }
}
