// Runtime validation also covers rules created before profile isolation existed.
// A legacy channel with no assigned profile is shared only within its own org.
export const legacyFlowIntegrationSelect = {
  organizationId: true,
  profileId: true,
  disabled: true,
  deletedAt: true,
  internalId: true,
} as const;

export function legacyFlowScopeMatches(
  flow:
    | {
        organizationId: string;
        profileId: string | null;
        integration: {
          organizationId: string;
          profileId: string | null;
          disabled: boolean;
          deletedAt: Date | null;
        };
      }
    | null
    | undefined
): boolean {
  const integration = flow?.integration;
  return Boolean(
    flow?.organizationId &&
      integration &&
      flow.organizationId === integration.organizationId &&
      !integration.disabled &&
      !integration.deletedAt &&
      (integration.profileId === null ||
        integration.profileId === flow.profileId)
  );
}
