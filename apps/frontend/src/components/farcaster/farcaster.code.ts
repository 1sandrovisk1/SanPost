'use client';

// Rotas do managed signer (upstream #2078/#2080): o login usa as publicas de
// /auth; a conexao de canal usa as autenticadas de /integrations. O status e
// consultado por POST em `${endpoint}/status` com o requestId no corpo.
export const FARCASTER_LOGIN_SIGNER_ENDPOINT = '/auth/farcaster/signer';
export const FARCASTER_CHANNEL_SIGNER_ENDPOINT =
  '/integrations/farcaster/signer';

// O code aprovado (requestId opaco) nunca vai na URL: o modal guarda na aba
// (sessionStorage) e a pagina seguinte o envia no corpo do POST.
const STORAGE_KEYS = {
  login: 'farcaster_login_code',
  connect: 'farcaster_connect_code',
} as const;

type FarcasterCodeKind = keyof typeof STORAGE_KEYS;

export const stashFarcasterCode = (kind: FarcasterCodeKind, code: string) => {
  try {
    window.sessionStorage.setItem(STORAGE_KEYS[kind], code);
  } catch {
    // sem sessionStorage (modo privado restrito): o fluxo falha na pagina
    // seguinte com "conexao invalida"
  }
};

export const peekFarcasterCode = (kind: FarcasterCodeKind): string => {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    return window.sessionStorage.getItem(STORAGE_KEYS[kind]) || '';
  } catch {
    return '';
  }
};

export const clearFarcasterCode = (kind: FarcasterCodeKind) => {
  try {
    window.sessionStorage.removeItem(STORAGE_KEYS[kind]);
  } catch {
    // nada a limpar
  }
};
