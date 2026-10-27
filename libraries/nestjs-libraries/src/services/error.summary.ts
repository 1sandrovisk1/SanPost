const MAX_MESSAGE = 300;

// nomes de campo que costumam carregar segredo (api_key, app_secret,
// fb_exchange_token, refreshToken, client_secret, password, code, sig...)
const SECRET_NAME =
  '[A-Za-z0-9_-]*(?:token|secret|password|passwd|api_?key|apikey|signature|credential)[A-Za-z0-9_-]*|code|sig|key|auth';

const REDACTIONS: Array<[RegExp, string]> = [
  // query/forma: nome=valor
  [new RegExp(`(^|[?&\\s;,(])(${SECRET_NAME})=([^&\\s"',;)]+)`, 'gi'), '$1$2=[redacted]'],
  // JSON: "nome": "valor"
  [new RegExp(`"(${SECRET_NAME})"\\s*:\\s*"[^"]*"`, 'gi'), '"$1":"[redacted]"'],
  // objeto impresso (ex.: invocacao do Prisma): nome: "valor"
  [new RegExp(`\\b(${SECRET_NAME})\\s*:\\s*"[^"]*"`, 'gi'), '$1: "[redacted]"'],
  // Authorization: Bearer xxx
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]'],
  // chaves com prefixo conhecido
  [/\b(?:sk|tvly|xox[abpr]|ghp|gho|github_pat|glpat)[-_][A-Za-z0-9_-]{6,}/g, '[redacted]'],
  // token do bot na URI da Bot API do Telegram
  [/\/bot\d+:[A-Za-z0-9_-]+/g, '/bot[redacted]'],
  // credenciais embutidas na URL
  [/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi, '$1[redacted]@'],
];

const clean = (message: string) => {
  let out = message.replace(/\s+/g, ' ').trim();
  for (const [pattern, replacement] of REDACTIONS) {
    out = out.replace(pattern, replacement);
  }
  return out.slice(0, MAX_MESSAGE);
};

const describeOne = (err: unknown): string => {
  if (!err || typeof err !== 'object') {
    return err === undefined || err === null ? 'unknown error' : clean(String(err));
  }

  const e = err as {
    name?: string;
    message?: string;
    type?: string;
    code?: string | number;
    details?: Array<{ identifier?: string }>;
    response?: { status?: number };
  };
  const className =
    e.constructor?.name && e.constructor.name !== 'Object'
      ? e.constructor.name
      : e.name || 'Error';
  const parts = [className];
  if (e.type) {
    parts.push(`type=${e.type}`);
  }
  const identifier = Array.isArray(e.details) ? e.details[0]?.identifier : undefined;
  if (identifier) {
    parts.push(`provider=${identifier}`);
  }
  if (e.response?.status) {
    parts.push(`status=${e.response.status}`);
  }
  if (e.code !== undefined && e.code !== null && e.code !== '') {
    parts.push(`code=${e.code}`);
  }
  const message = clean(e.message || '');
  return `${parts.join(' ')}${message ? `: ${message}` : ''}`;
};

/**
 * Resumo de uma excecao para log: classe, tipo (Temporal), provider, status
 * HTTP, codigo e mensagem curta (com pares token=... redigidos), mais um nivel
 * de `cause`. Nunca inclui `details` (corpo da resposta do provider), stack
 * ou o objeto de resposta — use no lugar de `console.log(err)`.
 */
export function summarizeError(err: unknown): string {
  const summary = describeOne(err);
  const cause = (err as { cause?: unknown } | null)?.cause;
  if (cause && typeof err === 'object') {
    return `${summary} (cause: ${describeOne(cause)})`;
  }
  return summary;
}
