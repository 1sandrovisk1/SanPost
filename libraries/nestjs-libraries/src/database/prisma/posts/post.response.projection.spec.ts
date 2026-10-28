import { toPublicIntegration, toPublicPost } from './post.response.projection';

// Mesma classe da CVE-2026-107761: as leituras de post do dashboard e o
// preview publico devolviam a linha inteira de Integration e o Post.error cru.
describe('toPublicIntegration', () => {
  it('devolve so os campos de exibicao, nunca token/refreshToken/customInstanceDetails', () => {
    const result = toPublicIntegration({
      id: 'int-1',
      name: 'Canal',
      picture: 'p.png',
      providerIdentifier: 'x',
      internalId: 'u1',
      profile: 'handle',
      disabled: false,
      inBetweenSteps: false,
      refreshNeeded: false,
      profileId: 'prof-1',
      customerId: null,
      token: 'SECRET',
      refreshToken: 'SECRET2',
      customInstanceDetails: '{"auth_token":"x"}',
      additionalSettings: '[]',
    } as any);

    expect(result).toEqual({
      id: 'int-1',
      name: 'Canal',
      picture: 'p.png',
      providerIdentifier: 'x',
      internalId: 'u1',
      profile: 'handle',
      disabled: false,
      inBetweenSteps: false,
      refreshNeeded: false,
      profileId: 'prof-1',
      customerId: null,
    });
    expect(JSON.stringify(result)).not.toMatch(/SECRET|auth_token/);
  });

  it('null e undefined passam adiante', () => {
    expect(toPublicIntegration(null)).toBeNull();
    expect(toPublicIntegration(undefined)).toBeUndefined();
  });
});

describe('toPublicPost', () => {
  it('remove error (pode trazer segredos do provider) e projeta a integracao', () => {
    const result = toPublicPost({
      id: 'p1',
      content: 'x',
      error: '{"refresh_token":"S"}',
      integration: { id: 'i', token: 'T' },
    } as any);

    expect(result).not.toHaveProperty('error');
    expect(result.integration).toEqual(expect.objectContaining({ id: 'i' }));
    expect(JSON.stringify(result)).not.toMatch(/"T"|refresh_token/);
  });

  it('childrenPost (linhas Post completas, com error) tambem sai', () => {
    const result = toPublicPost({
      id: 'p1',
      childrenPost: [{ id: 'c1', error: '{"client_secret":"S"}' }],
    } as any);
    expect(result).not.toHaveProperty('childrenPost');
    expect(JSON.stringify(result)).not.toMatch(/client_secret/);
  });

  it('batchId (liga o lote no backend) nao sai na resposta', () => {
    expect(toPublicPost({ id: 'p1', batchId: 'b-1' } as any)).not.toHaveProperty(
      'batchId'
    );
  });

  it('post sem integracao carregada fica sem a chave', () => {
    expect(toPublicPost({ id: 'p1', content: 'x' } as any)).not.toHaveProperty(
      'integration'
    );
  });
});
