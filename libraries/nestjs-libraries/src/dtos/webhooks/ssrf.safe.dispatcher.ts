import { Agent, buildConnector } from 'undici';
import axios, { AxiosInstance } from 'axios';
import dns from 'node:dns';
import net, { LookupFunction } from 'node:net';
import http from 'node:http';
import https from 'node:https';
import { isBlockedIp, isSsrfProtectionDisabled } from './webhook.url.validator';

// Pins DNS resolution: every resolved IP is checked with `isBlockedIp` and
// the caller (undici) connects to that same set. Closes the TOCTOU window
// `isSafePublicHttpsUrl` alone leaves open (see GHSA-f7jj-p389-4w45).
const BLOCKED_IP_MESSAGE = 'Blocked IP';

type SsrfLookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: any,
  family?: number
) => void;

/**
 * Lookup compartilhado por Undici e Axios. A verificacao acontece no momento
 * da conexao e o cliente usa exatamente o endereco aprovado, fechando a janela
 * de DNS rebinding entre uma validacao previa e o request real.
 */
export function ssrfSafeLookup(
  hostname: string,
  options: any,
  callback: SsrfLookupCallback
): void {
  if (net.isIP(hostname)) {
    const family = net.isIP(hostname);
    if (isBlockedIp(hostname)) {
      callback(new Error(BLOCKED_IP_MESSAGE), '', 0);
      return;
    }

    if (options?.all) {
      callback(null, [{ address: hostname, family }], family);
      return;
    }

    callback(null, hostname, family);
    return;
  }

  dns.lookup(hostname, options, (error, address: any, family: any) => {
    if (error) {
      callback(error, '', 0);
      return;
    }

    if (Array.isArray(address)) {
      if (address.some((entry) => isBlockedIp(entry.address))) {
        callback(new Error(BLOCKED_IP_MESSAGE), '', 0);
        return;
      }

      callback(null, address, 0);
      return;
    }

    if (isBlockedIp(address)) {
      callback(new Error(BLOCKED_IP_MESSAGE), '', 0);
      return;
    }

    callback(null, address, family);
  });
}

/**
 * `net.connect` pula `options.lookup` quando o host ja e um IP literal
 * (`http://127.0.0.1/`, `http://[::1]/`, redirect para um IP), entao o
 * `ssrfSafeLookup` sozinho nunca roda nesses casos. Esta conferencia e feita
 * na abertura de cada conexao, nos dois clientes, cobrindo redirects.
 */
export function isBlockedLiteralHost(hostname: string | undefined): boolean {
  if (!hostname) {
    return false;
  }

  const bare =
    hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;

  return net.isIP(bare) !== 0 && isBlockedIp(bare);
}

// Com `connect` em forma de funcao, o Agent deixa de repassar `connectTimeout`,
// `tls`, `allowH2` e `autoSelectFamily*` ao connector: se um dia forem
// necessarios, entram aqui, em `buildConnector({ ... })`.
const pinnedConnector = buildConnector({ lookup: ssrfSafeLookup });

export const ssrfSafeDispatcher = new Agent({
  connect: (options, callback) => {
    if (isBlockedLiteralHost(options.hostname)) {
      callback(new Error(BLOCKED_IP_MESSAGE), null);
      return;
    }

    pinnedConnector(options, callback);
  },
});

type CreateConnection = (
  options: { host?: string; hostname?: string },
  callback?: (error: Error | null, socket?: net.Socket) => void,
  ...rest: unknown[]
) => net.Socket | undefined;

/**
 * O `lookup` continua nas `options` do agente (DNS pinado); o guard de IP
 * literal entra antes do `createConnection` original do http/https Agent, que
 * tambem e o caminho seguido pelos redirects do axios.
 */
function withLiteralHostGuard<T extends http.Agent>(agent: T): T {
  const original = (agent as unknown as { createConnection: CreateConnection })
    .createConnection;

  (agent as unknown as { createConnection: CreateConnection }).createConnection =
    function guardedCreateConnection(options, callback, ...rest) {
      if (isBlockedLiteralHost(options?.host ?? options?.hostname)) {
        const error = new Error(BLOCKED_IP_MESSAGE);
        if (typeof callback !== 'function') {
          throw error;
        }
        process.nextTick(() => callback(error));
        return undefined;
      }

      return original.call(this, options, callback, ...rest);
    };

  return agent;
}

const pinnedHttpAgent = withLiteralHostGuard(
  new http.Agent({
    lookup: ssrfSafeLookup as LookupFunction,
  })
);
const pinnedHttpsAgent = withLiteralHostGuard(
  new https.Agent({
    lookup: ssrfSafeLookup as LookupFunction,
  })
);

const ssrfSafeAxios = axios.create({
  // Axios otherwise honors HTTP(S)_PROXY and the agent would validate only
  // the proxy address while that proxy could still reach an internal target.
  proxy: false,
  httpAgent: pinnedHttpAgent,
  httpsAgent: pinnedHttpsAgent,
});

// O guard vive nos agentes: qualquer opcao por chamada que troque o transporte
// (http2, transport/socketPath, proxy, outro agente) passaria por fora dele.
ssrfSafeAxios.interceptors.request.use((config) => {
  const candidate = config as typeof config & {
    httpVersion?: number;
    transport?: unknown;
    socketPath?: string;
  };
  const overridesTransport =
    candidate.httpVersion === 2 ||
    !!candidate.transport ||
    !!candidate.socketPath ||
    !!candidate.proxy ||
    (!!candidate.httpAgent && candidate.httpAgent !== pinnedHttpAgent) ||
    (!!candidate.httpsAgent && candidate.httpsAgent !== pinnedHttpsAgent);

  if (overridesTransport) {
    throw new Error(
      'ssrfSafeAxios does not accept transport overrides (httpVersion, transport, socketPath, proxy, httpAgent, httpsAgent)'
    );
  }

  return config;
});

/**
 * Opt-out reservado a instalacoes self-hosted que precisam alcancar providers
 * ou webhooks HTTPS dentro de uma rede privada confiavel.
 */
export function getSsrfSafeDispatcher(): Agent | undefined {
  return isSsrfProtectionDisabled() ? undefined : ssrfSafeDispatcher;
}

export function getSsrfSafeAxios(): AxiosInstance {
  return isSsrfProtectionDisabled() ? axios : ssrfSafeAxios;
}

type UndiciRequestInit = RequestInit & { dispatcher?: Agent };

/**
 * `init.dispatcher` so pode ser o proprio `ssrfSafeDispatcher` (callers que
 * forcam o guard mesmo sob `DISABLE_SSRF_PROTECTION`); qualquer outro
 * dispatcher trocaria o guard inteiro.
 */
export function ssrfSafeFetch(
  input: Parameters<typeof fetch>[0],
  init: UndiciRequestInit = {}
): Promise<Response> {
  if (init.dispatcher && init.dispatcher !== ssrfSafeDispatcher) {
    return Promise.reject(
      new Error('ssrfSafeFetch only accepts the pinned dispatcher')
    );
  }

  return fetch(input, {
    ...init,
    dispatcher: init.dispatcher ?? getSsrfSafeDispatcher(),
  } as RequestInit);
}
