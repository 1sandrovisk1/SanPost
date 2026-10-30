import { HttpException, Injectable } from '@nestjs/common';
import { OrganizationDeletionRepository } from './organization.deletion.repository';
@Injectable()
export class OrganizationDeletionService {
  constructor(private repository: OrganizationDeletionRepository) {}
  private async context(orgId: string, actorId: string) {
    const context = await this.repository.getContext(orgId, actorId);
    if (!context.actor?.isSuperAdmin)
      throw new HttpException('Platform administrator required', 403);
    if (!context.org || context.org.deletedAt)
      throw new HttpException('Organization not found', 404);
    return context.org;
  }
  async info(orgId: string, actorId: string) {
    const org = await this.context(orgId, actorId);
    return {
      id: org.id,
      name: org.name,
      billingBlocked: this.billingBlocked(org.subscription),
    };
  }
  private billingBlocked(
    subscription: {
      identifier: string | null;
      isLifetime: boolean;
      deletedAt: Date | null;
      cancelAt: Date | null;
    } | null
  ) {
    return (
      !!subscription?.identifier &&
      !subscription.isLifetime &&
      !subscription.deletedAt &&
      (!subscription.cancelAt || subscription.cancelAt.getTime() > Date.now())
    );
  }
  async delete(orgId: string, actorId: string, confirmationName: string) {
    const org = await this.context(orgId, actorId);
    if (org.name !== confirmationName)
      throw new HttpException('Organization name does not match', 400);
    if (this.billingBlocked(org.subscription))
      throw new HttpException(
        'Cancel the subscription before deleting this organization',
        409
      );
    if (!(await this.repository.softDelete(orgId, actorId, confirmationName)))
      throw new HttpException(
        'Organization changed. Reload and try again.',
        409
      );
    return { success: true };
  }
}
