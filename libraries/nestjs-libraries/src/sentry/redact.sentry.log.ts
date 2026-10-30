import {
  isSecretKey,
  redactSecrets,
} from '@gitroom/nestjs-libraries/services/error.summary';

const MAX_DEPTH = 6;
const MAX_ENTRIES = 100;
const MAX_STRING = 20_000;

// cabecalhos que carregam credencial
const SECRET_HEADER = /^(?:authorization|proxy-authorization|cookie|set-cookie|x-api-key)$/i;

// texto grande e cortado antes das regex (custo) e redigido
const redactText = (text: string) =>
  redactSecrets(
    text.length > MAX_STRING ? text.slice(0, MAX_STRING) + '…[truncated]' : text
  );

// Redige recursivamente: chave com nome de segredo e valor de texto vira
// [redacted] (numeros como error.code/totalTokens ficam); texto passa pelo
// redactSecrets (pares nome=valor, JSON — inclusive escapado —, Bearer, chaves
// conhecidas, credencial em URL). Objetos e Errors logados viram atributos
// (sentry.message.parameter.N) e precisam do mesmo tratamento. Fecha no fundo
// (profundidade/largura) para nao explodir com grafos grandes.
export const redactDeep = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string') {
    return redactText(value);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return '[depth limit]';
  }
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    return `[binary ${(value as ArrayBuffer).byteLength} bytes]`;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Map || value instanceof Set) {
    return `[${value.constructor.name} ${value.size}]`;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ENTRIES)
      .map((item) => redactDeep(item, depth + 1));
  }
  const source =
    value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : (value as Record<string, unknown>);
  return Object.fromEntries(
    Object.entries(source)
      .slice(0, MAX_ENTRIES)
      .map(([key, item]) => [
        key,
        typeof item === 'string' && (isSecretKey(key) || SECRET_HEADER.test(key))
          ? '[redacted]'
          : redactDeep(item, depth + 1),
      ])
  );
};

// Todo console.* do backend vira log no Sentry (consoleLoggingIntegration):
// redige mensagem e atributos antes de sair do processo.
export const redactSentryLog = <
  T extends { message?: unknown; attributes?: Record<string, unknown> }
>(
  log: T
): T => {
  const message =
    log.message === undefined
      ? undefined
      : redactSecrets(
          typeof log.message === 'string' ? log.message : String(log.message)
        );
  const attributes = log.attributes
    ? (redactDeep(log.attributes) as Record<string, unknown>)
    : log.attributes;
  return { ...log, message, attributes } as T;
};

// Breadcrumbs (console, http) acompanham os eventos de erro.
export const redactSentryBreadcrumb = <
  T extends { message?: string; data?: Record<string, unknown> }
>(
  breadcrumb: T
): T => ({
  ...breadcrumb,
  ...(breadcrumb.message !== undefined
    ? { message: redactText(breadcrumb.message) }
    : {}),
  ...(breadcrumb.data
    ? { data: redactDeep(breadcrumb.data) as Record<string, unknown> }
    : {}),
});

// Eventos de erro (captureException do FILTER): mensagem, excecoes, extra e
// corpo da requisicao.
export const redactSentryEvent = <
  T extends {
    message?: string;
    exception?: { values?: Array<{ value?: string }> };
    extra?: Record<string, unknown>;
    request?: {
      data?: unknown;
      url?: string;
      query_string?: unknown;
      headers?: Record<string, string>;
    };
  }
>(
  event: T
): T => ({
  ...event,
  ...(event.message !== undefined
    ? { message: redactSecrets(event.message) }
    : {}),
  ...(event.exception?.values
    ? {
        exception: {
          ...event.exception,
          values: event.exception.values.map((item) => ({
            ...item,
            ...(item.value !== undefined
              ? { value: redactSecrets(item.value) }
              : {}),
          })),
        },
      }
    : {}),
  ...(event.extra
    ? { extra: redactDeep(event.extra) as Record<string, unknown> }
    : {}),
  ...(event.request
    ? {
        request: {
          ...event.request,
          ...(event.request.data !== undefined
            ? { data: redactDeep(event.request.data) }
            : {}),
          ...(event.request.url !== undefined
            ? { url: redactText(event.request.url) }
            : {}),
          ...(event.request.query_string !== undefined
            ? { query_string: redactDeep(event.request.query_string) }
            : {}),
          ...(event.request.headers
            ? {
                headers: redactDeep(event.request.headers) as Record<
                  string,
                  string
                >,
              }
            : {}),
        },
      }
    : {}),
});

// Spans (chamadas HTTP de saida) levam a URL com query: access_token do Graph
// e afins saem redigidos
export const redactSentrySpan = <
  T extends { description?: string; data?: Record<string, unknown> }
>(
  span: T
): T => ({
  ...span,
  ...(span.description !== undefined
    ? { description: redactText(span.description) }
    : {}),
  ...(span.data ? { data: redactDeep(span.data) as Record<string, unknown> } : {}),
});
