jest.mock(
  '@gitroom/nestjs-libraries/integrations/social/nostr.provider',
  () => ({
    NostrProvider: class {
      identifier = 'nostr';
    },
  })
);
import { UsersController } from './users.controller';

// CVE-2026-107761: a linha inteira da organizacao (com apiKey) ia para
// qualquer membro.
describe('UsersController GET /user/organizations', () => {
  it('devolve so id, name, users e subscription das orgs ativas do usuario', async () => {
    const orgService = {
      getOrgsByUserId: jest.fn().mockResolvedValue([
        {
          id: 'org-1',
          name: 'Agencia',
          apiKey: 'CHAVE-SECRETA',
          language: 'pt',
          users: [{ disabled: false, role: 'USER' }],
          subscription: { subscriptionTier: 'FREE' },
        },
        {
          id: 'org-2',
          name: 'Desativada',
          apiKey: 'OUTRA',
          users: [{ disabled: true, role: 'USER' }],
          subscription: null,
        },
      ]),
    };
    const controller = new UsersController(
      {} as any,
      {} as any,
      {} as any,
      orgService as any,
      {} as any,
      {} as any,
      {} as any
    );

    const result = await controller.getOrgs({ id: 'user-1' } as any);

    expect(result).toEqual([
      {
        id: 'org-1',
        name: 'Agencia',
        users: [{ disabled: false, role: 'USER' }],
        subscription: { subscriptionTier: 'FREE' },
      },
    ]);
    expect(JSON.stringify(result)).not.toContain('CHAVE-SECRETA');
  });
});
