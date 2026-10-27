import { legacyFlowScopeMatches } from './legacy-flow-scope';
describe('escopo legado de execucao', () => {
  const integration = {
    organizationId: 'o',
    profileId: 'p',
    disabled: false,
    deletedAt: null as Date | null,
  };
  const flow = { organizationId: 'o', profileId: 'p', integration };
  it('exige metadados e permite conta do mesmo perfil', () => {
    expect(legacyFlowScopeMatches(null)).toBe(false);
    expect(legacyFlowScopeMatches(flow)).toBe(true);
    expect(legacyFlowScopeMatches({ ...flow, integration: null })).toBe(false);
  });
  it('preserva conta sem perfil somente na mesma organizacao', () => {
    expect(
      legacyFlowScopeMatches({
        ...flow,
        integration: { ...integration, profileId: null },
      })
    ).toBe(true);
    expect(
      legacyFlowScopeMatches({
        ...flow,
        organizationId: 'other',
        integration: { ...integration, profileId: null },
      })
    ).toBe(false);
    expect(legacyFlowScopeMatches({ ...flow, profileId: null })).toBe(false);
  });
  it.each([
    { profileId: 'other' },
    { disabled: true },
    { deletedAt: new Date() },
  ])('rejeita conta movida ou indisponivel %o', (override) => {
    expect(
      legacyFlowScopeMatches({
        ...flow,
        integration: { ...integration, ...override },
      })
    ).toBe(false);
  });
});
