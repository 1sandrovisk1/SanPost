import { Integration } from '@prisma/client';

// Campos de exibicao da Integration nas respostas HTTP de post. Nunca token,
// refreshToken, customInstanceDetails (mesma classe da CVE-2026-107761).
export const PUBLIC_INTEGRATION_FIELDS = [
  'id',
  'name',
  'picture',
  'providerIdentifier',
  'internalId',
  'profile',
  'disabled',
  'inBetweenSteps',
  'refreshNeeded',
  'profileId',
  'customerId',
] as const;

export type PublicIntegration = Pick<
  Integration,
  (typeof PUBLIC_INTEGRATION_FIELDS)[number]
>;

export function toPublicIntegration(integration: null): null;
export function toPublicIntegration(integration: undefined): undefined;
export function toPublicIntegration(
  integration: Partial<Integration>
): PublicIntegration;
export function toPublicIntegration(
  integration: Partial<Integration> | null | undefined
): PublicIntegration | null | undefined;
export function toPublicIntegration(
  integration: Partial<Integration> | null | undefined
): PublicIntegration | null | undefined {
  if (!integration) {
    return integration as null | undefined;
  }
  const projected: Record<string, unknown> = {};
  for (const key of PUBLIC_INTEGRATION_FIELDS) {
    projected[key] = integration[key];
  }
  return projected as PublicIntegration;
}

// Post.error guarda a excecao crua do provider (pode trazer refresh_token /
// client_secret) e nenhuma tela le esse campo nas leituras por id. childrenPost
// sai pelo mesmo motivo (linhas Post completas, com error): a resposta ja traz
// a thread achatada em posts[].
export function toPublicPost<
  T extends {
    error?: unknown;
    childrenPost?: unknown;
    integration?: Partial<Integration> | null;
  }
>(post: T): Omit<T, 'error' | 'childrenPost' | 'integration'> & {
  integration?: PublicIntegration | null;
} {
  const { error: _error, childrenPost: _children, integration, ...rest } = post;
  void _error;
  void _children;
  return {
    ...rest,
    ...(integration !== undefined
      ? { integration: toPublicIntegration(integration) }
      : {}),
  };
}
