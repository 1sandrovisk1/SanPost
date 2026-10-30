import { Injectable } from '@nestjs/common';
import { PrismaRepository, PrismaTransaction } from '../prisma.service';

@Injectable()
export class OrganizationDeletionRepository {
  constructor(
    private transaction: PrismaTransaction,
    private organizations: PrismaRepository<'organization'>,
    private users: PrismaRepository<'user'>
  ) {}
  async getContext(orgId: string, actorId: string) {
    const [org, actor] = await Promise.all([
      this.organizations.model.organization.findUnique({
        where: { id: orgId },
        select: { id: true, name: true, deletedAt: true, subscription: true },
      }),
      this.users.model.user.findUnique({
        where: { id: actorId },
        select: { isSuperAdmin: true },
      }),
    ]);
    return { org, actor };
  }
  async softDelete(orgId: string, actorId: string, confirmationName: string) {
    return this.transaction.model.$transaction(
      async (tx) => {
        const actor = await tx.user.findFirst({
          where: { id: actorId, isSuperAdmin: true },
          select: { id: true },
        });
        if (!actor) return false;
        const now = new Date();
        const result = await tx.organization.updateMany({
          where: {
            id: orgId,
            name: confirmationName,
            deletedAt: null,
            OR: [
              { subscription: { is: null } },
              {
                subscription: {
                  is: {
                    OR: [
                      { identifier: null },
                      { isLifetime: true },
                      { deletedAt: { not: null } },
                      { cancelAt: { lte: now } },
                    ],
                  },
                },
              },
            ],
          },
          data: { deletedAt: now, apiKey: null },
        });
        if (!result.count) return false;
        await tx.profile.updateMany({
          where: { organizationId: orgId },
          data: { deletedAt: now, apiKey: null },
        });
        await tx.integration.updateMany({
          where: { organizationId: orgId },
          data: { deletedAt: now, disabled: true },
        });
        await tx.post.updateMany({
          where: { organizationId: orgId },
          data: { deletedAt: now },
        });
        await tx.reviewLink.updateMany({
          where: { organizationId: orgId },
          data: { revokedAt: now },
        });
        await tx.oAuthAuthorization.updateMany({
          where: {
            OR: [
              { organizationId: orgId },
              { oauthApp: { organizationId: orgId } },
            ],
          },
          data: { revokedAt: now, accessToken: null, authorizationCode: null },
        });
        await tx.oAuthApp.updateMany({
          where: { organizationId: orgId },
          data: { deletedAt: now },
        });
        await tx.plugs.updateMany({
          where: { organizationId: orgId },
          data: { activated: false },
        });
        await tx.webhooks.updateMany({
          where: { organizationId: orgId },
          data: { deletedAt: now },
        });
        await tx.flow.updateMany({
          where: { organizationId: orgId },
          data: { status: 'ARCHIVED', deletedAt: now },
        });
        await tx.repostRule.updateMany({
          where: { organizationId: orgId },
          data: { enabled: false, deletedAt: now },
        });
        await tx.autoPost.updateMany({
          where: { organizationId: orgId },
          data: { active: false, deletedAt: now },
        });
        await tx.userOrganization.updateMany({
          where: { organizationId: orgId },
          data: { disabled: true },
        });
        return true;
      },
      { isolationLevel: 'Serializable' }
    );
  }
}
